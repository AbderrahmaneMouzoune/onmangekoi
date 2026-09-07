-- ============================================================
-- onmangekoi — scénario : chacun apporte son resto
-- ============================================================
-- Couvre `public.add_session_restaurant` et
-- `public.remove_session_restaurant` (migration 20260907120000) :
--   * un participant qui n'est pas host peut ajouter un restaurant ;
--   * l'ajout est idempotent et prend la position suivante du deck ;
--   * un non-participant est refusé, et plus personne n'ajoute une fois le
--     vote lancé ;
--   * on retire ce qu'on a apporté — le host arbitre, le dernier resto reste ;
--   * l'export RGPD nomme les restos apportés par son appelant.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/session-restaurants.test.sql
--
-- Tout se joue sous le rôle `authenticated` : les grants d'exécution et la
-- RLS font partie de ce qu'on vérifie, au même titre que le corps des
-- fonctions. Le script tient dans une transaction terminée par ROLLBACK.
-- ============================================================

\set ON_ERROR_STOP on

\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'
\set carol '33333333-3333-4333-8333-333333333333'

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

-- Se met dans la peau d'un utilisateur connecté.
create or replace function pg_temp.act_as(p_uid uuid)
  returns void
  language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

-- Renvoie le code métier `omk:*` levé par une instruction, ou null si elle
-- passe. Une erreur technique remonte telle quelle et fait échouer le script.
create or replace function pg_temp.omk_of(p_sql text)
  returns text
  language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception
  when others then
    if sqlerrm like 'omk:%' then
      return substr(sqlerrm, 5);
    end if;
    raise;
end;
$$;

-- ─── FIXTURES ────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  (:'alice', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@example.test', '{"pseudo":"Alice"}'::jsonb),
  (:'bob', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bob@example.test', '{"pseudo":"Bob"}'::jsonb),
  (:'carol', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'carol@example.test', '{"pseudo":"Carol"}'::jsonb);

-- Trois restaurants du seed : deux à la création, un apporté par Bob.
select id as resto1 from public.restaurants order by name limit 1
\gset
select id as resto2 from public.restaurants order by name offset 1 limit 1
\gset
select id as resto3 from public.restaurants order by name offset 2 limit 1
\gset

set local role authenticated;

-- ─── ALICE CRÉE LA SESSION ───────────────────────────────────
select pg_temp.act_as(:'alice');

select id as session_id, invite_code as invite_code
from public.create_session('Midi de mardi', array[:'resto1'::uuid, :'resto2'::uuid])
\gset

select pg_temp.assert(
  (select count(*) from public.session_restaurants where session_id = :'session_id'::uuid) = 2,
  'la session part avec les deux restos du host'
);

select pg_temp.assert(
  not exists (
    select 1 from public.session_restaurants
    where session_id = :'session_id'::uuid
      and added_by is distinct from :'alice'::uuid
  ),
  'les restos posés à la création sont attribués au host'
);

-- ─── BOB REJOINT ET APPORTE LE SIEN ──────────────────────────
select pg_temp.act_as(:'bob');
select public.join_session(:'invite_code');

select public.add_session_restaurant(:'session_id'::uuid, :'resto3'::uuid);

select pg_temp.assert(
  exists (
    select 1 from public.session_restaurants sr
    where sr.session_id = :'session_id'::uuid
      and sr.restaurant_id = :'resto3'::uuid
      and sr.added_by = :'bob'::uuid
      and sr.position = 2
  ),
  'un participant qui n’est pas host ajoute son resto, en fin de deck'
);

-- Deux personnes peuvent proposer le même resto : la seconde ne doit pas voir
-- d'erreur, et rien ne doit être dupliqué.
select public.add_session_restaurant(:'session_id'::uuid, :'resto3'::uuid);

select pg_temp.assert(
  (select count(*) from public.session_restaurants where session_id = :'session_id'::uuid) = 3,
  'un ajout en double est idempotent'
);

-- ─── CE QUE LA BASE REFUSE ───────────────────────────────────
select pg_temp.act_as(:'carol');
select pg_temp.assert(
  pg_temp.omk_of(format(
    'select public.add_session_restaurant(%L, %L)', :'session_id', :'resto1'
  )) = 'not_participant',
  'un non-participant ne peut rien ajouter'
);

select pg_temp.act_as(:'bob');
select pg_temp.assert(
  pg_temp.omk_of(format(
    'select public.remove_session_restaurant(%L, %L)', :'session_id', :'resto1'
  )) = 'not_your_restaurant',
  'on ne retire pas le resto de quelqu’un d’autre'
);

-- ─── LE HOST ARBITRE, LE DERNIER RESTO RESTE ─────────────────
select pg_temp.act_as(:'alice');
select public.remove_session_restaurant(:'session_id'::uuid, :'resto3'::uuid);

select pg_temp.assert(
  (select count(*) from public.session_restaurants where session_id = :'session_id'::uuid) = 2,
  'le host retire le resto d’un autre sur sa session'
);

select public.remove_session_restaurant(:'session_id'::uuid, :'resto2'::uuid);

select pg_temp.assert(
  pg_temp.omk_of(format(
    'select public.remove_session_restaurant(%L, %L)', :'session_id', :'resto1'
  )) = 'no_restaurants',
  'le dernier resto ne peut pas être retiré'
);

-- ─── UNE FOIS LE VOTE LANCÉ, LE DECK EST FIGÉ ────────────────
select public.launch_session(:'session_id'::uuid);

select pg_temp.assert(
  pg_temp.omk_of(format(
    'select public.add_session_restaurant(%L, %L)', :'session_id', :'resto2'
  )) = 'session_already_started',
  'plus personne n’ajoute une fois le vote lancé'
);

select pg_temp.assert(
  pg_temp.omk_of(format(
    'select public.remove_session_restaurant(%L, %L)', :'session_id', :'resto1'
  )) = 'session_already_started',
  'plus personne ne retire une fois le vote lancé'
);

-- ─── EXPORT RGPD ─────────────────────────────────────────────
-- Le resto apporté par Bob a été retiré depuis : l'export ne parle que des
-- liens encore en base, comme pour le reste des données de session.
select pg_temp.assert(
  (
    select coalesce(sum(jsonb_array_length(p -> 'restaurants_added')), 0)
    from jsonb_array_elements(public.export_my_data() -> 'participations') as p
  ) = 1,
  'l’export nomme les restos apportés par son appelant'
);

reset role;
select set_config('request.jwt.claims', '', true);

rollback;
