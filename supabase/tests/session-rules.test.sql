-- ============================================================
-- onmangekoi — scénario : règles de vote personnalisables
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #16 :
--   * les règles sont normalisées et bornées en base — clé absente complétée
--     par son défaut, clé inconnue ou valeur hors bornes refusée ;
--   * `submit_vote` lit `rules` au lieu de ses constantes : 2 vetos passent,
--     le troisième est refusé, et un quota à 0 met le joker hors jeu dès le
--     premier essai ;
--   * la clôture automatique tombe au seuil choisi — 4 votants sur 5 pour
--     `close_at_ratio = 0.8` — et le classement compte les votes manquants
--     à 0, exactement comme une clôture forcée ;
--   * les règles sont figées au lancement : toute écriture de `rules` sur une
--     session qui n'est plus en attente est refusée, quel que soit le rôle ;
--   * `session_preview` expose les règles pour l'écran d'invitation.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/session-rules.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set host   '11111111-1111-4111-8111-111111111111'
\set guest1 '22222222-2222-4222-8222-222222222222'
\set guest2 '33333333-3333-4333-8333-333333333333'
\set guest3 '44444444-4444-4444-8444-444444444444'
\set guest4 '55555555-5555-4555-8555-555555555555'

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

-- Exécute un appel et renvoie le message d'erreur levé, ou null s'il passe.
create or replace function pg_temp.error_of(p_sql text)
  returns text
  language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception
  when others then return sqlerrm;
end;
$$;

-- Vote la même valeur sur tous les restaurants encore à voter d'une session :
-- c'est ce qui fait passer un participant en « a terminé ». La fonction
-- s'exécute sous le rôle et le JWT courants — donc pour la personne en cours.
create or replace function pg_temp.vote_all(
  p_session_id uuid,
  p_value smallint,
  p_profile_id uuid
)
  returns void
  language plpgsql
as $$
declare
  v_restaurant uuid;
begin
  for v_restaurant in
    select sr.id
    from public.session_restaurants sr
    where sr.session_id = p_session_id
      and not exists (
        select 1
        from public.votes v
        join public.session_participants sp on sp.id = v.participant_id
        where v.session_restaurant_id = sr.id
          and sp.profile_id = p_profile_id
      )
    order by sr.position
  loop
    perform public.submit_vote(p_session_id, v_restaurant, p_value);
  end loop;
end;
$$;

-- ─── FIXTURES ────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'host',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Hôte"}'::jsonb, true),
  (:'guest1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Alex"}'::jsonb, true),
  (:'guest2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Bilal"}'::jsonb, true),
  (:'guest3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Camille"}'::jsonb, true),
  (:'guest4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Dany"}'::jsonb, true);

-- Les identifiants voyagent par une table de travail : psql n'interpole pas
-- ses variables à l'intérieur d'un bloc `do $$ … $$`.
create temporary table t_users (label text primary key, id uuid not null);
insert into t_users (label, id) values
  ('host', :'host'), ('guest1', :'guest1'), ('guest2', :'guest2'),
  ('guest3', :'guest3'), ('guest4', :'guest4');

-- Quatre restaurants : il en faut au moins trois pour tenter un veto de trop.
create temporary table t_resto as
select id from (select id, name from public.restaurants order by name limit 4) s;

-- Le code d'invitation voyage avec l'id : psql n'interpole pas ses variables
-- à l'intérieur d'un bloc `do $$ … $$`, et l'aperçu s'appelle depuis un bloc.
create temporary table t_sessions (label text primary key, id uuid not null, invite_code text not null);

-- Les tables de travail appartiennent à `postgres` : sans ce droit, les blocs
-- joués sous le rôle `authenticated` ne les liraient pas.
grant select on t_resto to authenticated;
grant select on t_users to authenticated;
grant select, insert on t_sessions to authenticated;

-- ============================================================
-- 1. Règles à la création : défaut, complétion, bornes
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_ids uuid[] := (select array_agg(id) from t_resto);
  v_session public.sessions;
  v_err text;
begin
  raise notice '1. règles à la création';

  v_session := public.create_session('Midi par défaut', v_ids);
  perform pg_temp.assert(
    v_session.rules = '{"superlikes": 1, "vetos": 1, "close_at_ratio": 1}'::jsonb,
    'sans règles, la session reprend les règles historiques'
  );

  -- Le client n'envoie que ce qu'il change : le reste est complété en base.
  v_session := public.create_session(
    'Midi sur mesure', v_ids, null, '{"vetos": 2, "close_at_ratio": 0.8}'::jsonb
  );
  perform pg_temp.assert(
    (v_session.rules ->> 'vetos')::int = 2
      and (v_session.rules ->> 'close_at_ratio')::numeric = 0.8
      and (v_session.rules ->> 'superlikes')::int = 1,
    'une règle partielle est complétée par les valeurs par défaut'
  );

  v_err := pg_temp.error_of(
    format('select public.create_session(%L, %L::uuid[], null, %L::jsonb)',
           'Trop de vetos', v_ids, '{"vetos": 9}')
  );
  perform pg_temp.assert(v_err = 'omk:invalid_rules', 'plus de 5 vetos est refusé');

  v_err := pg_temp.error_of(
    format('select public.create_session(%L, %L::uuid[], null, %L::jsonb)',
           'Minorité décisive', v_ids, '{"close_at_ratio": 0.3}')
  );
  perform pg_temp.assert(
    v_err = 'omk:invalid_rules',
    'clôturer sous la moitié des votants est refusé'
  );

  v_err := pg_temp.error_of(
    format('select public.create_session(%L, %L::uuid[], null, %L::jsonb)',
           'Joker fractionnaire', v_ids, '{"superlikes": 1.5}')
  );
  perform pg_temp.assert(v_err = 'omk:invalid_rules', 'un joker fractionnaire est refusé');

  v_err := pg_temp.error_of(
    format('select public.create_session(%L, %L::uuid[], null, %L::jsonb)',
           'Règle inconnue', v_ids, '{"jokers": 2}')
  );
  perform pg_temp.assert(
    v_err = 'omk:invalid_rules',
    'une clé inconnue est refusée plutôt qu''ignorée en silence'
  );

  v_err := pg_temp.error_of(
    format('select public.create_session(%L, %L::uuid[], null, %L::jsonb)',
           'Pas un objet', v_ids, '"deux vetos"')
  );
  perform pg_temp.assert(v_err = 'omk:invalid_rules', 'des règles qui ne sont pas un objet sont refusées');
end;
$$;

-- ============================================================
-- 2. Jokers : deux vetos passent, le troisième non ; zéro coup
--    de cœur met le joker hors jeu dès le premier essai
-- ============================================================
do $$
declare
  v_ids uuid[] := (select array_agg(id) from t_resto);
  v_session public.sessions;
begin
  v_session := public.create_session(
    'Deux vetos', v_ids, null, '{"vetos": 2, "superlikes": 0}'::jsonb
  );
  insert into t_sessions (label, id, invite_code)
  values ('jokers', v_session.id, v_session.invite_code);
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'guest1' || '","role":"authenticated"}', true);
select public.join_session((select invite_code from t_sessions where label = 'jokers'));

select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);
select public.launch_session((select id from t_sessions where label = 'jokers'));

do $$
declare
  v_id uuid := (select id from t_sessions where label = 'jokers');
  v_restaurants uuid[];
  v_err text;
  v_spent boolean;
begin
  raise notice '2. quotas de jokers';

  select array_agg(id order by position) into v_restaurants
  from public.session_restaurants where session_id = v_id;

  perform public.submit_vote(v_id, v_restaurants[1], (-2)::smallint);
  select super_dislike_used into v_spent
  from public.session_participants
  where session_id = v_id and profile_id = (select id from t_users where label = 'host');
  perform pg_temp.assert(
    v_spent is false,
    'après un veto sur deux, le quota n''est pas épuisé'
  );

  perform public.submit_vote(v_id, v_restaurants[2], (-2)::smallint);
  select super_dislike_used into v_spent
  from public.session_participants
  where session_id = v_id and profile_id = (select id from t_users where label = 'host');
  perform pg_temp.assert(v_spent, 'le second veto épuise le quota');

  v_err := pg_temp.error_of(
    format('select public.submit_vote(%L, %L, (-2)::smallint)', v_id, v_restaurants[3])
  );
  perform pg_temp.assert(v_err = 'omk:super_dislike_used', 'un troisième veto est refusé');

  v_err := pg_temp.error_of(
    format('select public.submit_vote(%L, %L, 2::smallint)', v_id, v_restaurants[3])
  );
  perform pg_temp.assert(
    v_err = 'omk:superlike_used',
    'un quota à 0 refuse le coup de cœur dès le premier essai'
  );

  -- Les votes ordinaires restent illimités : le refus portait bien sur le quota.
  perform public.submit_vote(v_id, v_restaurants[3], 1::smallint);
  perform public.submit_vote(v_id, v_restaurants[4], 1::smallint);
  perform pg_temp.assert(
    (select has_finished_voting from public.session_participants
      where session_id = v_id and profile_id = (select id from t_users where label = 'host')),
    'le host a terminé ses votes'
  );
  perform pg_temp.assert(
    (select status from public.sessions where id = v_id) = 'voting',
    'à 100 %, la session attend toujours le second participant'
  );
end;
$$;

-- ============================================================
-- 3. Clôture à 80 % : quatre votants sur cinq suffisent
-- ============================================================
do $$
declare
  v_ids uuid[] := (select array_agg(id) from t_resto);
  v_session public.sessions;
begin
  v_session := public.create_session(
    'Clôture à 80 %', v_ids, null, '{"close_at_ratio": 0.8}'::jsonb
  );
  insert into t_sessions (label, id, invite_code)
  values ('ratio', v_session.id, v_session.invite_code);
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'guest1' || '","role":"authenticated"}', true);
select public.join_session((select invite_code from t_sessions where label = 'ratio'));
select set_config('request.jwt.claims', '{"sub":"' || :'guest2' || '","role":"authenticated"}', true);
select public.join_session((select invite_code from t_sessions where label = 'ratio'));
select set_config('request.jwt.claims', '{"sub":"' || :'guest3' || '","role":"authenticated"}', true);
select public.join_session((select invite_code from t_sessions where label = 'ratio'));
select set_config('request.jwt.claims', '{"sub":"' || :'guest4' || '","role":"authenticated"}', true);
select public.join_session((select invite_code from t_sessions where label = 'ratio'));

select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);
select public.launch_session((select id from t_sessions where label = 'ratio'));

-- Le host pose son coup de cœur sur le premier restaurant — celui qui devra
-- sortir en tête — puis vote « ça me va » sur tous les autres.
do $$
declare
  v_id uuid := (select id from t_sessions where label = 'ratio');
  v_first uuid;
begin
  raise notice '3. clôture au seuil choisi';

  select id into v_first from public.session_restaurants
   where session_id = v_id order by position limit 1;

  perform public.submit_vote(v_id, v_first, 2::smallint);
  perform pg_temp.vote_all(v_id, 1::smallint, (select id from t_users where label = 'host'));
  perform pg_temp.assert(
    (select count(*) from public.session_participants
      where session_id = v_id and has_finished_voting) = 1,
    'un votant sur cinq a terminé'
  );
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'guest1' || '","role":"authenticated"}', true);
select pg_temp.vote_all((select id from t_sessions where label = 'ratio'), 1::smallint, :'guest1'::uuid);
select set_config('request.jwt.claims', '{"sub":"' || :'guest2' || '","role":"authenticated"}', true);
select pg_temp.vote_all((select id from t_sessions where label = 'ratio'), 1::smallint, :'guest2'::uuid);

do $$
declare
  v_id uuid := (select id from t_sessions where label = 'ratio');
begin
  perform pg_temp.assert(
    (select status from public.sessions where id = v_id) = 'voting',
    'à trois votants sur cinq (60 %), le vote continue'
  );
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'guest3' || '","role":"authenticated"}', true);
select pg_temp.vote_all((select id from t_sessions where label = 'ratio'), 1::smallint, :'guest3'::uuid);

do $$
declare
  v_id uuid := (select id from t_sessions where label = 'ratio');
  v_session public.sessions;
begin
  select * into v_session from public.sessions where id = v_id;
  perform pg_temp.assert(
    v_session.status = 'closed',
    'le quatrième votant sur cinq (80 %) clôture la session'
  );
  perform pg_temp.assert(
    v_session.closed_at is not null,
    '`closed_at` est posé comme lors d''une clôture manuelle'
  );
  perform pg_temp.assert(
    exists (
      select 1 from public.session_participants
      where session_id = v_id and not has_finished_voting
    ),
    'un participant n''avait pas fini : c''est bien le seuil qui a clôturé'
  );
end;
$$;

-- Le classement est celui d'une clôture forcée : le vote absent compte 0.
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_id uuid := (select id from t_sessions where label = 'ratio');
  v_top record;
begin
  select * into v_top from public.session_results(v_id) where rank = 1;
  perform pg_temp.assert(
    v_top.score = 5,
    'le premier cumule quatre votants dont un coup de cœur (2 + 1 + 1 + 1)'
  );
  perform pg_temp.assert(
    v_top.votes_count = 4,
    'le cinquième participant n''a rien voté : son bulletin compte 0'
  );
end;
$$;

-- ============================================================
-- 4. Règles figées au lancement
-- ============================================================
-- La garantie appartient à la base : on écrit `rules` en direct, sous le rôle
-- le plus privilégié, sans passer par la moindre RPC.
reset role;

do $$
declare
  v_voting uuid := (select id from t_sessions where label = 'jokers');
  v_waiting uuid;
  v_err text;
begin
  raise notice '4. règles figées au lancement';

  perform pg_temp.assert(
    (select status from public.sessions where id = v_voting) = 'voting',
    'la session témoin est bien en cours de vote'
  );

  v_err := pg_temp.error_of(
    format('update public.sessions set rules = %L::jsonb where id = %L', '{"superlikes": 3, "vetos": 3, "close_at_ratio": 1}', v_voting)
  );
  perform pg_temp.assert(v_err = 'omk:rules_locked', 'changer les règles pendant le vote est refusé');

  v_err := pg_temp.error_of(
    format('update public.sessions set rules = %L::jsonb where id = %L', '{"superlikes": 3, "vetos": 3, "close_at_ratio": 1}', (select id from t_sessions where label = 'ratio'))
  );
  perform pg_temp.assert(v_err = 'omk:rules_locked', 'changer les règles après la clôture est refusé');

  -- Le gel ne touche que `rules` : le reste de la session reste modifiable.
  update public.sessions set closes_at = now() + interval '10 minutes' where id = v_voting;

  -- En attente, les règles se changent encore : rien n'a été voté.
  select id into v_waiting from public.sessions where status = 'waiting' limit 1;
  update public.sessions set rules = '{"superlikes": 2, "vetos": 2, "close_at_ratio": 0.75}'::jsonb
    where id = v_waiting;
  perform pg_temp.assert(
    (select (rules ->> 'vetos')::int from public.sessions where id = v_waiting) = 2,
    'en salle d''attente, les règles sont encore modifiables'
  );

  -- La contrainte tient aussi hors RPC : aucune écriture ne peut sortir des bornes.
  v_err := pg_temp.error_of(
    format('update public.sessions set rules = %L::jsonb where id = %L', '{"superlikes": 1, "vetos": 1, "close_at_ratio": 0.1}', v_waiting)
  );
  perform pg_temp.assert(
    v_err like '%sessions_rules_valid%',
    'la contrainte `check` refuse une règle hors bornes écrite en direct'
  );
end;
$$;

-- ============================================================
-- 5. L'écran d'invitation annonce les règles
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'guest4' || '","role":"authenticated"}', true);

do $$
declare
  v_preview record;
begin
  raise notice '5. aperçu d''invitation';

  select * into v_preview
  from public.session_preview((select invite_code from t_sessions where label = 'jokers'));
  perform pg_temp.assert(v_preview.id is not null, 'l''aperçu trouve bien la session');
  perform pg_temp.assert(
    (v_preview.rules ->> 'vetos')::int = 2 and (v_preview.rules ->> 'superlikes')::int = 0,
    'l''aperçu expose les règles de la session'
  );
end;
$$;

select set_config('request.jwt.claims', '', true);
reset role;

rollback;
