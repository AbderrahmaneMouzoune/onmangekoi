-- ============================================================
-- onmangekoi — scénario : sélection proposée à la création
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #59 :
--   * sans historique, rien n'est proposé — pas même un resto du catalogue ;
--   * avec un historique : les restaurants vus récemment, les plus récents
--     d'abord, sans les gagnants des 30 derniers jours (décision « On y va »
--     comprise), plus un seul jamais proposé, choisi sans hasard ;
--   * la limite est respectée et bornée ;
--   * la fonction ne rend ni score ni vote ;
--   * chacun ne reçoit que ce que son propre historique justifie.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/suggest-restaurants.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set host      '11111111-1111-4111-8111-111111111111'
\set guest     '22222222-2222-4222-8222-222222222222'
\set outsider  '33333333-3333-4333-8333-333333333333'
\set newcomer  '44444444-4444-4444-8444-444444444444'

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
   '{"pseudo":"Passant"}'::jsonb, true),
  (:'newcomer', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Nouveau"}'::jsonb, true);

-- Des restaurants à soi plutôt que ceux du seed : le « dernier arrivé au
-- carnet » doit être connu d'avance, donc daté ici.
create temporary table t_resto (label text primary key, id uuid not null);

with inserted as (
  insert into public.restaurants (name, created_at, created_by)
  values
    ('Test Sug 1', now() - interval '2 days', null),
    ('Test Sug 2', now() - interval '2 days', null),
    ('Test Sug 3', now() - interval '2 days', null),
    ('Test Sug 4', now() - interval '2 days', null),
    ('Test Sug 5', now() - interval '2 days', null),
    ('Test Sug 6', now() - interval '2 days', null),
    ('Test Sug 7', now() - interval '2 days', null),
    ('Test Sug 8', now() - interval '2 days', null),
    ('Test Sug liste', now() - interval '3 days', null),
    ('Test Sug perso', now() - interval '2 hours', :'host'),
    ('Test Sug carnet', now() + interval '1 minute', null)
  returning id, name
)
insert into t_resto (label, id)
select case name
         when 'Test Sug liste' then 'list'
         when 'Test Sug perso' then 'own'
         when 'Test Sug carnet' then 'catalog'
         else 'r' || right(name, 1)
       end,
       id
from inserted;

create temporary table t_user (label text primary key, id uuid not null);
insert into t_user (label, id)
values ('host', :'host'), ('guest', :'guest'), ('outsider', :'outsider'),
       ('newcomer', :'newcomer');

grant select on t_resto to authenticated;
grant select on t_user to authenticated;

create or replace function pg_temp.resto(p_label text)
  returns uuid
  language sql
  stable
as $$
  select id from t_resto where label = p_label;
$$;

/*
 * Fabrique une session : ses participants (le premier est le host et le seul
 * votant), ses restaurants, un vote par restaurant quand une valeur est
 * donnée. `created_at` est posé à la main : dans une transaction, `now()` ne
 * bouge pas, et c'est lui qui ordonne « vu récemment ».
 */
create or replace function pg_temp.seed_session(
  p_name text,
  p_status public.session_status,
  p_created_at timestamptz,
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
  insert into public.sessions (name, host_id, status, created_at, launched_at, closed_at)
  values (p_name, p_members[1], p_status, p_created_at, p_created_at, p_closed_at)
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
  v_host uuid := (select id from t_user where label = 'host');
  v_guest uuid := (select id from t_user where label = 'guest');
  v_outsider uuid := (select id from t_user where label = 'outsider');
  v_newcomer uuid := (select id from t_user where label = 'newcomer');
  v_decided uuid;
  v_list uuid;
begin
  -- Il y a deux jours, avec l'invité : le 1 gagne, le 2 et le 3 restent.
  perform pg_temp.seed_session(
    'Déj de mardi', 'closed', now() - interval '2 days', now() - interval '2 days',
    array[v_host, v_guest],
    array[pg_temp.resto('r1'), pg_temp.resto('r2'), pg_temp.resto('r3')],
    array[2, 1, 0]::smallint[]
  );
  -- Il y a cinq jours : le 5 gagne au score, mais le host a décidé d'aller
  -- au 4. C'est la décision qui compte — le 4 est écarté, le 5 revient.
  v_decided := pg_temp.seed_session(
    'Déj de jeudi', 'closed', now() - interval '5 days', now() - interval '5 days',
    array[v_host],
    array[pg_temp.resto('r4'), pg_temp.resto('r5')],
    array[0, 2]::smallint[]
  );
  update public.sessions
     set decided_restaurant_id = pg_temp.resto('r4'), decided_at = now() - interval '5 days'
   where id = v_decided;
  -- Il y a quarante jours : le 6 a gagné, mais la fatigue est passée.
  perform pg_temp.seed_session(
    'Le mois dernier', 'closed', now() - interval '40 days', now() - interval '40 days',
    array[v_host],
    array[pg_temp.resto('r6')],
    array[2]::smallint[]
  );
  -- Ce midi, en cours : le 7 est sur la table, donc vu.
  perform pg_temp.seed_session(
    'Ce midi', 'voting', now() - interval '1 hour', null,
    array[v_host],
    array[pg_temp.resto('r7')],
    array[null]::smallint[]
  );
  -- Chez les voisins : le host n'en fait pas partie. Le 8 y gagne.
  perform pg_temp.seed_session(
    'Chez les voisins', 'closed', now() - interval '1 day', now() - interval '1 day',
    array[v_outsider],
    array[pg_temp.resto('r8'), pg_temp.resto('r3')],
    array[2, -2]::smallint[]
  );

  -- La liste du host : un resto qu'il n'a jamais proposé, et le 2, déjà vu.
  insert into public.lists (name, owner_id) values ('Mes adresses', v_host)
  returning id into v_list;
  insert into public.list_restaurants (list_id, restaurant_id, added_at)
  values (v_list, pg_temp.resto('list'), now() - interval '1 hour'),
         (v_list, pg_temp.resto('r2'), now());

  -- Le nouveau venu a une liste, mais aucune session : pas d'historique.
  insert into public.lists (name, owner_id) values ('Ma liste', v_newcomer)
  returning id into v_list;
  insert into public.list_restaurants (list_id, restaurant_id)
  values (v_list, pg_temp.resto('r1'));
end;
$$;

-- ============================================================
-- 1. Forme de la fonction : ni score ni vote
-- ============================================================
do $$
declare
  v_result text := pg_get_function_result('public.suggest_restaurants(int)'::regprocedure);
begin
  raise notice '1. forme';
  perform pg_temp.assert(
    v_result = 'TABLE(restaurant restaurants, reason text, source text, excluded_winners integer)',
    'la fonction ne rend que le restaurant, la raison, la source et un compteur de gagnants'
  );
  perform pg_temp.assert(
    (select p.prosecdef and p.proconfig @> array['search_path=""']
       from pg_proc p
      where p.oid = 'public.suggest_restaurants(int)'::regprocedure),
    'security definer, search_path figé'
  );
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.suggest_restaurants(int)', 'execute'),
    'un visiteur anonyme n''a rien à demander ici'
  );
  perform pg_temp.assert(
    has_function_privilege('authenticated', 'public.suggest_restaurants(int)', 'execute'),
    'un compte connecté peut demander sa suggestion'
  );
end;
$$;

set local role authenticated;

-- ============================================================
-- 2. Sans historique : rien
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"' || :'newcomer' || '","role":"authenticated"}', true);

do $$
begin
  raise notice '2. sans historique';
  perform pg_temp.assert(
    not exists (select 1 from public.suggest_restaurants()),
    'sans session passée, aucune suggestion — ni sa liste, ni le catalogue'
  );
end;
$$;

-- ============================================================
-- 3. Le host
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_ids uuid[];
  v_recent uuid[];
begin
  raise notice '3. la suggestion du host';

  select array_agg((s.restaurant).id order by ord)
    into v_ids
    from public.suggest_restaurants() with ordinality as s(restaurant, reason, source, excluded_winners, ord);

  perform pg_temp.assert(cardinality(v_ids) = 5, 'cinq restaurants par défaut');

  select array_agg((s.restaurant).id order by ord)
    into v_recent
    from public.suggest_restaurants() with ordinality as s(restaurant, reason, source, excluded_winners, ord)
   where s.reason = 'recent';

  perform pg_temp.assert(
    v_recent = array[pg_temp.resto('r7'), pg_temp.resto('r2'), pg_temp.resto('r3'), pg_temp.resto('r5')],
    'les non-gagnants vus récemment, le plus récent d''abord'
  );
  perform pg_temp.assert(
    not (pg_temp.resto('r1') = any (v_ids)),
    'le gagnant de mardi est écarté'
  );
  perform pg_temp.assert(
    not (pg_temp.resto('r4') = any (v_ids)),
    'le resto décidé (« On y va ») est écarté, même à score nul'
  );
  perform pg_temp.assert(
    pg_temp.resto('r5') = any (v_recent),
    'le premier au score d''une session décidée ailleurs n''est pas un gagnant'
  );
  perform pg_temp.assert(
    not (pg_temp.resto('r8') = any (v_ids)),
    'une session où l''on n''était pas n''entre pas dans l''historique'
  );
  perform pg_temp.assert(
    (select bool_and(s.source = 'history') from public.suggest_restaurants() s where s.reason = 'recent'),
    'les lignes récentes viennent de l''historique'
  );
  perform pg_temp.assert(
    (select every(s.excluded_winners = 2) from public.suggest_restaurants() s),
    'deux gagnants écartés, annoncés sur chaque ligne'
  );

  perform pg_temp.assert(
    (select count(*) from public.suggest_restaurants() s where s.reason = 'never_proposed') = 1,
    'un seul jamais proposé'
  );
  perform pg_temp.assert(
    (select (s.restaurant).id = pg_temp.resto('list') and s.source = 'mine'
       from public.suggest_restaurants() s
      where s.reason = 'never_proposed'),
    'le jamais proposé est le dernier entré dans ses listes, avant ses propres ajouts plus anciens'
  );
  perform pg_temp.assert(
    v_ids[5] = pg_temp.resto('list'),
    'le jamais proposé vient en dernier'
  );

  -- Limites
  perform pg_temp.assert(
    (select array_agg((s.restaurant).id order by ord)
       from public.suggest_restaurants(3) with ordinality as s(restaurant, reason, source, excluded_winners, ord))
      = array[pg_temp.resto('r7'), pg_temp.resto('r2'), pg_temp.resto('list')],
    'limite 3 : deux récents et un jamais proposé'
  );
  perform pg_temp.assert(
    (select array_agg((s.restaurant).id) from public.suggest_restaurants(1) s)
      = array[pg_temp.resto('r7')],
    'limite 1 : le plus récent seulement'
  );
  perform pg_temp.assert(
    (select count(*) from public.suggest_restaurants(100)) = 6,
    'une limite démesurée est bornée : tout l''historique utile (5) et un jamais proposé'
  );
  perform pg_temp.assert(
    (select count(*) from public.suggest_restaurants(0)) = 1,
    'une limite nulle ou négative vaut 1'
  );
end;
$$;

-- Plus de liste : ses propres ajouts prennent le relais.
reset role;
delete from public.list_restaurants where restaurant_id = pg_temp.resto('list');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
begin
  perform pg_temp.assert(
    (select (s.restaurant).id = pg_temp.resto('own') and s.source = 'mine'
       from public.suggest_restaurants() s
      where s.reason = 'never_proposed'),
    'sans liste utile, le jamais proposé est le dernier resto qu''on a ajouté soi-même'
  );
end;
$$;

-- ============================================================
-- 4. Chacun son historique
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"' || :'guest' || '","role":"authenticated"}', true);

do $$
begin
  raise notice '4. le point de vue de chacun';
  perform pg_temp.assert(
    (select array_agg((s.restaurant).id order by ord)
       from public.suggest_restaurants() with ordinality as s(restaurant, reason, source, excluded_winners, ord)
      where s.reason = 'recent')
      = array[pg_temp.resto('r2'), pg_temp.resto('r3')],
    'l''invité ne retrouve que sa session de mardi, sans son gagnant'
  );
  perform pg_temp.assert(
    (select (s.restaurant).id = pg_temp.resto('catalog') and s.source = 'catalog'
       from public.suggest_restaurants() s
      where s.reason = 'never_proposed'),
    'sans liste ni ajout, le jamais proposé est le dernier arrivé au carnet'
  );
  perform pg_temp.assert(
    (select every(s.excluded_winners = 1) from public.suggest_restaurants() s),
    'un seul gagnant écarté pour lui : la décision du host ne le concerne pas'
  );
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'outsider' || '","role":"authenticated"}', true);

do $$
begin
  perform pg_temp.assert(
    (select array_agg((s.restaurant).id) from public.suggest_restaurants() s where s.reason = 'recent')
      = array[pg_temp.resto('r3')],
    'le passant ne voit que sa session : le 3, vétoé, revient quand même — les votes n''entrent pas en compte'
  );
  perform pg_temp.assert(
    not exists (
      select 1 from public.suggest_restaurants() s
      where (s.restaurant).id in (pg_temp.resto('r2'), pg_temp.resto('r5'), pg_temp.resto('r7'))
    ),
    'rien de l''historique du host ne fuit chez le passant'
  );
end;
$$;

-- Sans jeton : personne, donc rien.
select set_config('request.jwt.claims', '', true);

do $$
begin
  perform pg_temp.assert(
    not exists (select 1 from public.suggest_restaurants()),
    'sans utilisateur, aucune suggestion'
  );
end;
$$;

reset role;

rollback;
