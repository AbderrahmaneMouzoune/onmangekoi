-- ============================================================
-- onmangekoi — scénario : anti-fatigue (gagnants récents)
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #5 :
--   * `recent_winners()` ne répond que pour l'appelant : une session close à
--     laquelle il n'a pas participé ne lui apprend rien ;
--   * elle ne dit que le gagnant — les autres restaurants du classement, et
--     a fortiori le détail des votes, n'en sortent pas ;
--   * la fenêtre est la constante `recent_winners_window()`, 30 jours ;
--   * une seule ligne par restaurant, datée de son dernier sacre ;
--   * un classement sans oui (score nul ou négatif) ne fatigue personne et ne
--     produit aucun gagnant ;
--   * une session en cours, elle, n'a pas encore de gagnant.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/recent-winners.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set host     '11111111-1111-4111-8111-111111111111'
\set guest    '22222222-2222-4222-8222-222222222222'
\set outsider '33333333-3333-4333-8333-333333333333'

begin;

create or replace function pg_temp.assert(p_ok boolean, p_label text)
  returns void
  language plpgsql
as $$
begin
  if p_ok is not true then
    raise exception 'ÉCHEC — %', p_label;
  end if;
  raise notice 'ok — %', p_label;
end;
$$;

-- ─── FIXTURES ────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'host', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Hôte"}'::jsonb, true),
  (:'guest', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Invité"}'::jsonb, true),
  (:'outsider', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Passant"}'::jsonb, true);

create temporary table t_resto as
select row_number() over (order by name) as n, id
from public.restaurants
order by name
limit 8;

-- `psql` n'interpole pas ses variables dans un bloc `do $$` : les identifiants
-- passent par une table de travail, que les blocs joués sous le rôle
-- `authenticated` doivent pouvoir lire.
create temporary table t_user (label text primary key, id uuid not null);
insert into t_user (label, id)
values ('host', :'host'), ('guest', :'guest'), ('outsider', :'outsider');

grant select on t_resto to authenticated;
grant select on t_user to authenticated;

/*
 * Fabrique une session de toutes pièces : ses participants (le premier est le
 * host et le seul votant), ses restaurants, et un vote par restaurant quand
 * une valeur est donnée. Un vote suffit à poser un score — c'est tout ce que
 * le classement regarde.
 */
create or replace function pg_temp.seed_session(
  p_name text,
  p_status public.session_status,
  p_closed_at timestamptz,
  p_members uuid[],
  p_restaurants uuid[],
  p_values smallint[]
)
  returns uuid
  language plpgsql
as $$
declare
  v_session uuid;
  v_voter uuid;
  v_member uuid;
  v_session_restaurant uuid;
  v_i int;
begin
  insert into public.sessions (name, host_id, status, launched_at, closed_at)
  values (p_name, p_members[1], p_status, now() - interval '1 hour', p_closed_at)
  returning id into v_session;

  foreach v_member in array p_members loop
    insert into public.session_participants (session_id, profile_id)
    values (v_session, v_member);
  end loop;

  select id into v_voter
    from public.session_participants
   where session_id = v_session and profile_id = p_members[1];

  for v_i in 1 .. array_length(p_restaurants, 1) loop
    insert into public.session_restaurants (session_id, restaurant_id, position)
    values (v_session, p_restaurants[v_i], v_i - 1)
    returning id into v_session_restaurant;

    if p_values[v_i] is not null then
      insert into public.votes (session_id, participant_id, session_restaurant_id, value)
      values (v_session, v_voter, v_session_restaurant, p_values[v_i]);
    end if;
  end loop;

  return v_session;
end;
$$;

do $$
declare
  r uuid[] := (select array_agg(id order by n) from t_resto);
  v_host uuid := (select id from t_user where label = 'host');
  v_guest uuid := (select id from t_user where label = 'guest');
  v_outsider uuid := (select id from t_user where label = 'outsider');
begin
  -- Vendredi dernier : le 1 gagne, le 2 suit, le 3 laisse indifférent.
  perform pg_temp.seed_session(
    'Déj de vendredi', 'closed', now() - interval '2 days',
    array[v_host, v_guest], array[r[1], r[2], r[3]], array[2, 1, 0]::smallint[]
  );
  -- Le même 1 avait déjà gagné dix jours plus tôt : un seul sacre doit rester,
  -- le plus récent.
  perform pg_temp.seed_session(
    'Déj d''avant', 'closed', now() - interval '10 days',
    array[v_host], array[r[1]], array[1]::smallint[]
  );
  -- Hors fenêtre : plus d'un mois, la fatigue est passée.
  perform pg_temp.seed_session(
    'Le mois dernier', 'closed', now() - interval '41 days',
    array[v_host], array[r[4]], array[2]::smallint[]
  );
  -- Une session d'inconnus : le host n'en fait pas partie, il n'en saura rien.
  perform pg_temp.seed_session(
    'Chez les voisins', 'closed', now() - interval '1 day',
    array[v_outsider], array[r[5]], array[2]::smallint[]
  );
  -- Égalité parfaite en tête : deux gagnants, comme au classement.
  perform pg_temp.seed_session(
    'Ex aequo', 'closed', now() - interval '5 days',
    array[v_host], array[r[6], r[7]], array[1, 1]::smallint[]
  );
  -- Personne n'a dit oui : pas de gagnant.
  perform pg_temp.seed_session(
    'Sans enthousiasme', 'closed', now() - interval '3 days',
    array[v_host], array[r[8]], array[0]::smallint[]
  );
  -- En cours : le gagnant n'existe pas encore.
  perform pg_temp.seed_session(
    'Ce midi', 'voting', null,
    array[v_host], array[r[2]], array[2]::smallint[]
  );
end;
$$;

-- ============================================================
-- 1. La fenêtre est une constante de configuration
-- ============================================================
do $$
begin
  raise notice '1. fenêtre';
  perform pg_temp.assert(
    public.recent_winners_window() = interval '30 days',
    'la fenêtre vaut 30 jours (miroir de RECENT_WINNER_WINDOW_DAYS)'
  );
end;
$$;

-- ============================================================
-- 2. Ce que le host voit
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  r uuid[] := (select array_agg(id order by n) from t_resto);
  v_rows int;
  v_last timestamptz;
begin
  raise notice '2. les gagnants récents du host';

  select count(*) into v_rows from public.recent_winners();
  perform pg_temp.assert(v_rows = 3, 'trois gagnants récents : le vainqueur du vendredi et les deux ex aequo');

  perform pg_temp.assert(
    exists (select 1 from public.recent_winners() w where w.restaurant_id = r[1]),
    'le vainqueur d''une session close est un gagnant récent'
  );

  select w.last_won_at into v_last from public.recent_winners() w where w.restaurant_id = r[1];
  perform pg_temp.assert(
    v_last between now() - interval '2 days' - interval '1 minute'
              and now() - interval '2 days' + interval '1 minute',
    'une seule ligne par restaurant, datée du dernier sacre'
  );

  perform pg_temp.assert(
    not exists (select 1 from public.recent_winners() w where w.restaurant_id = r[2]),
    'le deuxième du classement n''est pas un gagnant'
  );
  perform pg_temp.assert(
    not exists (select 1 from public.recent_winners() w where w.restaurant_id = r[3]),
    'le dernier du classement non plus'
  );
  perform pg_temp.assert(
    not exists (select 1 from public.recent_winners() w where w.restaurant_id = r[4]),
    'un sacre de plus de 30 jours est sorti de la fenêtre'
  );
  perform pg_temp.assert(
    not exists (select 1 from public.recent_winners() w where w.restaurant_id = r[5]),
    'une session à laquelle on n''a pas participé n''apprend rien'
  );
  perform pg_temp.assert(
    (select count(*) from public.recent_winners() w where w.restaurant_id in (r[6], r[7])) = 2,
    'deux restaurants à égalité en tête sont deux gagnants'
  );
  perform pg_temp.assert(
    not exists (select 1 from public.recent_winners() w where w.restaurant_id = r[8]),
    'un classement où personne n''a dit oui ne sacre personne'
  );
end;
$$;

-- ============================================================
-- 3. Chacun ne voit que ses propres sessions
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"' || :'guest' || '","role":"authenticated"}', true);

do $$
declare
  r uuid[] := (select array_agg(id order by n) from t_resto);
begin
  raise notice '3. le point de vue de chacun';

  perform pg_temp.assert(
    exists (select 1 from public.recent_winners() w where w.restaurant_id = r[1]),
    'un participant non-host voit le gagnant de sa session'
  );
  perform pg_temp.assert(
    (select count(*) from public.recent_winners()) = 1,
    'et rien des sessions où il n''était pas'
  );
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'outsider' || '","role":"authenticated"}', true);

do $$
declare
  r uuid[] := (select array_agg(id order by n) from t_resto);
begin
  perform pg_temp.assert(
    (select array_agg(w.restaurant_id) from public.recent_winners() w) = array[r[5]],
    'le passant ne voit que le gagnant de sa propre session'
  );
end;
$$;

select set_config('request.jwt.claims', '', true);
reset role;

-- ============================================================
-- 4. Droits d'exécution
-- ============================================================
do $$
begin
  raise notice '4. droits';
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.recent_winners()', 'execute'),
    'un visiteur anonyme n''a rien à demander ici'
  );
  perform pg_temp.assert(
    has_function_privilege('authenticated', 'public.recent_winners()', 'execute'),
    'un compte connecté peut interroger ses gagnants récents'
  );
end;
$$;

rollback;
