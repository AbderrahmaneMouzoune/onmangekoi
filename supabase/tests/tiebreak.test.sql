-- ============================================================
-- onmangekoi — scénario : départage d'une égalité parfaite
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #10 :
--   * le tirage au sort est fait en base, stocké, donc identique pour tout
--     le monde — jamais recalculé côté client ;
--   * le second tour hérite des participants sans qu'ils aient à rejoindre,
--     ne garde que les ex æquo et remet les jokers à zéro ;
--   * `session_results` expose l'état du départage dans `tiebreak`.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/tiebreak.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'
\set carol '33333333-3333-4333-8333-333333333333'
\set dave  '44444444-4444-4444-8444-444444444444'

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

-- Prend l'identité d'un compte pour les appels suivants : c'est ce que lit
-- `auth.uid()`, donc toutes les RPC.
create or replace function pg_temp.login(p_uid uuid)
  returns void
  language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true
  );
end;
$$;

-- Vrai si l'instruction lève bien l'erreur métier attendue.
create or replace function pg_temp.raises(p_sql text, p_code text)
  returns boolean
  language plpgsql
as $$
begin
  execute p_sql;
  return false;
exception
  when others then
    return sqlerrm = 'omk:' || p_code;
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
   'carol@example.test', '{"pseudo":"Carol"}'::jsonb),
  (:'dave', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dave@example.test', '{"pseudo":"Dave"}'::jsonb);

create temporary table t_user (label text primary key, id uuid not null);
insert into t_user values
  ('alice', :'alice'), ('bob', :'bob'), ('carol', :'carol'), ('dave', :'dave');

-- Joue une session complète à trois : alice héberge, tout le monde vote,
-- la clôture automatique fait le reste.
--   * les deux premiers restos finissent à +3 — l'égalité parfaite ;
--   * le troisième reste derrière à +2, porté par le coup de cœur d'alice :
--     son joker servira à vérifier la remise à zéro du second tour ;
--   * `p_tie = false` fait voter « bof » sur le deuxième, qui laisse alors
--     le premier seul en tête.
create or replace function pg_temp.play(p_name text, p_tie boolean)
  returns uuid
  language plpgsql
as $$
declare
  v_alice uuid := (select id from t_user where label = 'alice');
  v_bob uuid := (select id from t_user where label = 'bob');
  v_carol uuid := (select id from t_user where label = 'carol');
  v_restaurants uuid[];
  v_session public.sessions;
  v_uid uuid;
  v_sr record;
begin
  select array_agg(s.id order by s.name) into v_restaurants
  from (select id, name from public.restaurants order by name limit 3) s;

  perform pg_temp.login(v_alice);
  v_session := public.create_session(p_name, v_restaurants);

  perform pg_temp.login(v_bob);
  perform public.join_session(v_session.invite_code);
  perform pg_temp.login(v_carol);
  perform public.join_session(v_session.invite_code);

  perform pg_temp.login(v_alice);
  perform public.launch_session(v_session.id);

  foreach v_uid in array array[v_alice, v_bob, v_carol] loop
    perform pg_temp.login(v_uid);
    for v_sr in
      select id, position
      from public.session_restaurants
      where session_id = v_session.id
      order by position
    loop
      perform public.submit_vote(
        v_session.id,
        v_sr.id,
        (case
          when v_sr.position = 2 then case when v_uid = v_alice then 2 else 0 end
          when v_sr.position = 1 and not p_tie then 0
          else 1
        end)::smallint
      );
    end loop;
  end loop;

  return v_session.id;
end;
$$;

-- ─── TIRAGE AU SORT ──────────────────────────────────────────
create temporary table t_draw (id uuid);
insert into t_draw select pg_temp.play('Midi — tirage', true);

select pg_temp.login(id) from t_user where label = 'alice';

create temporary table t_tied as
select * from public.session_results((select id from t_draw));

select pg_temp.assert(
  (select status from public.sessions where id = (select id from t_draw)) = 'closed',
  'la session se clôture d’elle-même quand tout le monde a voté'
);

select pg_temp.assert(
  (select count(*) from t_tied where rank = 1) = 2
  and (select count(*) from t_tied where tiebreak = 'tied') = 2
  and (select count(*) from t_tied where tiebreak is null) = 1,
  'l’égalité de tête est annoncée par `tiebreak`, le troisième n’est pas concerné'
);

select pg_temp.assert(
  (select count(distinct score) from t_tied where rank = 1) = 1,
  'les deux ex æquo ont bien le même score'
);

-- Le départage est réservé au host.
select pg_temp.login(id) from t_user where label = 'bob';
select pg_temp.assert(
  pg_temp.raises('select public.draw_winner((select id from t_draw))', 'host_only'),
  'un participant qui n’héberge pas ne peut pas départager'
);

select pg_temp.login(id) from t_user where label = 'alice';
create temporary table t_drawn as select * from public.draw_winner((select id from t_draw));

select pg_temp.assert(
  (select tiebreak_method from t_drawn) = 'draw'
  and (select tiebreak_winner_id from t_drawn) in (select session_restaurant_id from t_tied where rank = 1),
  'le tirage désigne l’un des deux ex æquo, et lui seul'
);

-- Relu par un autre participant : c'est la base qui a tranché, pas le client.
select pg_temp.login(id) from t_user where label = 'carol';
create temporary table t_after as
select * from public.session_results((select id from t_draw));

select pg_temp.assert(
  (select session_restaurant_id from t_after order by rank limit 1)
    = (select tiebreak_winner_id from t_drawn),
  'tout le monde lit le même gagnant, en tête du classement'
);

select pg_temp.assert(
  (select tiebreak from t_after order by rank limit 1) = 'winner'
  and (select count(*) from t_after where tiebreak = 'loser') = 1
  and (select count(*) from t_after where tiebreak is null) = 1,
  'le classement distingue le désigné, l’ex æquo écarté et les non-concernés'
);

select pg_temp.assert(
  (select rank from t_after where tiebreak = 'loser') = 2
  and (select score from t_after where tiebreak = 'loser')
    = (select score from t_after where tiebreak = 'winner'),
  'l’ex æquo écarté garde son score, au rang suivant'
);

select pg_temp.login(id) from t_user where label = 'alice';
select pg_temp.assert(
  pg_temp.raises('select public.draw_winner((select id from t_draw))', 'tiebreak_settled'),
  'on ne retire pas au sort une égalité déjà tranchée'
);
select pg_temp.assert(
  pg_temp.raises('select public.create_runoff_session((select id from t_draw))', 'tiebreak_settled'),
  'un tirage ferme aussi la porte au second tour'
);

-- Uniformité du tirage : 300 lancers sur 3 valeurs, aucune hors bornes,
-- aucune jamais tirée.
create temporary table t_rolls as
select public.random_below(3) as value from generate_series(1, 300);

select pg_temp.assert(
  (select min(value) from t_rolls) >= 0
  and (select max(value) from t_rolls) <= 2
  and (select count(distinct value) from t_rolls) = 3,
  'le tirage reste dans ses bornes et visite toutes les valeurs'
);

select pg_temp.assert(
  pg_temp.raises('select public.random_below(0)', 'invalid_bound'),
  'un tirage sans candidat est refusé'
);

-- ─── SECOND TOUR ─────────────────────────────────────────────
create temporary table t_runoff_parent (id uuid);
insert into t_runoff_parent select pg_temp.play('Midi — second tour', true);

select pg_temp.login(id) from t_user where label = 'alice';

create temporary table t_parent_tied as
select * from public.session_results((select id from t_runoff_parent))
where rank = 1;

create temporary table t_child as
select * from public.create_runoff_session((select id from t_runoff_parent));

select pg_temp.assert(
  (select status from t_child) = 'voting'
  and (select launched_at from t_child) is not null
  and (select parent_session_id from t_child) = (select id from t_runoff_parent)
  and (select name from t_child) = 'Midi — second tour',
  'le second tour démarre aussitôt et sait de quelle session il est la suite'
);

select pg_temp.assert(
  (select invite_code from t_child) <> (
    select invite_code from public.sessions where id = (select id from t_runoff_parent)
  ),
  'le second tour a son propre code d’invitation'
);

select pg_temp.assert(
  (select count(*) from public.session_restaurants where session_id = (select id from t_child)) = 2
  and not exists (
    select 1
    from public.session_restaurants sr
    where sr.session_id = (select id from t_child)
      and sr.restaurant_id not in (select restaurant_id from t_parent_tied)
  )
  and (
    select array_agg(position order by position)
    from public.session_restaurants
    where session_id = (select id from t_child)
  ) = array[0, 1],
  'le second tour ne rejoue que les ex æquo, repositionnés depuis zéro'
);

select pg_temp.assert(
  (select count(*) from public.session_participants where session_id = (select id from t_child)) = 3
  and not exists (
    select 1
    from public.session_participants sp
    where sp.session_id = (select id from t_child)
      and sp.profile_id not in (
        select profile_id
        from public.session_participants
        where session_id = (select id from t_runoff_parent)
      )
  ),
  'les participants du premier tour sont là sans avoir eu à rejoindre'
);

select pg_temp.assert(
  not exists (
    select 1
    from public.session_participants
    where session_id = (select id from t_child)
      and (superlike_used or super_dislike_used or has_finished_voting)
  )
  and exists (
    select 1
    from public.session_participants
    where session_id = (select id from t_runoff_parent) and superlike_used
  ),
  'les jokers repartent à zéro alors qu’ils étaient consommés au premier tour'
);

select pg_temp.assert(
  (select tiebreak_method from public.sessions where id = (select id from t_runoff_parent)) = 'runoff'
  and (
    select count(*)
    from public.session_results((select id from t_runoff_parent))
    where tiebreak = 'runoff'
  ) = 2,
  'le premier tour annonce le second au lieu de désigner un gagnant'
);

select pg_temp.assert(
  pg_temp.raises(
    'select public.create_runoff_session((select id from t_runoff_parent))',
    'tiebreak_settled'
  ),
  'un second tour ne se crée pas deux fois'
);

-- Le lien « second tour » se lit sous RLS, sans RPC dédiée : les participants
-- du premier tour le sont aussi du second.
select pg_temp.login(id) from t_user where label = 'bob';
grant select on t_runoff_parent to authenticated;

set local role authenticated;

create temporary table t_seen_child as
select id, parent_session_id
from public.sessions
where parent_session_id = (select id from t_runoff_parent);

reset role;

select pg_temp.assert(
  (select count(*) from t_seen_child) = 1
  and (select id from t_seen_child) = (select id from t_child),
  'un participant retrouve le second tour depuis le premier'
);

-- ─── CE QUI N'EST PAS UNE ÉGALITÉ ────────────────────────────
create temporary table t_clear (id uuid);
insert into t_clear select pg_temp.play('Midi — sans égalité', false);

select pg_temp.login(id) from t_user where label = 'alice';

select pg_temp.assert(
  (select count(*) from public.session_results((select id from t_clear)) where tiebreak is not null) = 0,
  'un classement sans égalité ne parle pas de départage'
);

select pg_temp.assert(
  pg_temp.raises('select public.draw_winner((select id from t_clear))', 'no_tie')
  and pg_temp.raises('select public.create_runoff_session((select id from t_clear))', 'no_tie'),
  'il n’y a rien à départager quand un restaurant est seul en tête'
);

select pg_temp.assert(
  pg_temp.raises('select public.draw_winner((select id from t_child))', 'session_not_closed'),
  'on ne départage pas une session dont le vote est en cours'
);

-- ─── SURFACE EXPOSÉE ─────────────────────────────────────────
select pg_temp.assert(
  not has_function_privilege('authenticated', 'public.random_below(int)', 'execute')
  and not has_function_privilege('authenticated', 'public.session_tied_restaurants(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.tiebreak_candidates(uuid)', 'execute'),
  'les rouages internes du départage ne sont pas appelables par le client'
);

select pg_temp.assert(
  has_function_privilege('authenticated', 'public.draw_winner(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.create_runoff_session(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.draw_winner(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.create_runoff_session(uuid)', 'execute'),
  'les deux départages sont ouverts aux comptes connectés, fermés aux anonymes'
);

select pg_temp.login(id) from t_user where label = 'dave';
select pg_temp.assert(
  (select count(*) from public.session_results((select id from t_draw))) = 0,
  'qui ne participe pas ne lit aucun classement, départage compris'
);

rollback;
