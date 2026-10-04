-- ============================================================
-- onmangekoi — scénario : session ouverte
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #58 :
--   * une session ouverte créée sans échéance est refusée à la création
--     (`omk:open_session_needs_deadline`) ; avec, elle part directement en
--     `voting`, sans salle d'attente ni lancement ;
--   * le mode est figé dès la création, et la table refuse une session
--     ouverte sans échéance ;
--   * une session ordinaire refuse toujours une arrivée pendant le vote
--     (`omk:session_started`) ; une session ouverte l'accepte ;
--   * l'arrivant tardif vote sur le même instantané de restaurants — personne
--     n'en ajoute en cours de route ;
--   * la clôture automatique à 100 % ne s'applique pas : tout le monde a
--     fini, la session reste ouverte ;
--   * l'échéance ferme la session et le classement compte les votes
--     manquants à 0 ; passé l'échéance, plus personne n'entre ;
--   * un groupe s'invite pendant le vote, l'aperçu anonyme existe ;
--   * le second tour n'hérite pas du mode ouvert.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/open-session.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set host    'a1111111-1111-4111-8111-111111111111'
\set late    'a2222222-2222-4222-8222-222222222222'
\set silent  'a3333333-3333-4333-8333-333333333333'
\set outside 'a4444444-4444-4444-8444-444444444444'

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

-- ─── FIXTURES ────────────────────────────────────────────────
-- L'hôte, l'arrivant tardif qui vote, un invité de groupe qui entre sans
-- voter, et quelqu'un qui arrive après l'échéance.
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'host', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Hôte"}'::jsonb, true),
  (:'late', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Retardataire"}'::jsonb, true),
  (:'silent', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Silencieux"}'::jsonb, true),
  (:'outside', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Trop tard"}'::jsonb, true);

-- Trois restaurants, dans un ordre stable : A, B, C.
create temporary table t_resto as
select id, row_number() over (order by name) as ord
from (select id, name from public.restaurants order by name limit 3) s;

create temporary table t_sessions (label text primary key, id uuid not null);

-- Le groupe récurrent de l'hôte, posé hors RPC : le scénario porte sur
-- l'invitation pendant le vote, pas sur la sauvegarde d'un groupe.
insert into public.groups (id, name, owner_id)
values ('a5555555-5555-4555-8555-555555555555', 'Déjeuner', :'host');
insert into public.group_members (group_id, profile_id)
values
  ('a5555555-5555-4555-8555-555555555555', :'host'),
  ('a5555555-5555-4555-8555-555555555555', :'silent');

-- Les tables de travail appartiennent à `postgres` : sans ce droit, les blocs
-- joués sous le rôle `authenticated` ne les liraient pas.
grant select on t_resto to authenticated;
grant select, insert on t_sessions to authenticated;

-- ============================================================
-- 1. Création : l'échéance est obligatoire, la salle d'attente disparaît
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_ids uuid[] := (select array_agg(id order by ord) from t_resto);
  v_session public.sessions;
  v_err text;
begin
  raise notice '1. création';

  v_err := pg_temp.error_of(format(
    'select public.create_session(%L, %L::uuid[], null, %L::jsonb)',
    'Sans échéance', v_ids, '{"open": true}'
  ));
  perform pg_temp.assert(
    v_err = 'omk:open_session_needs_deadline',
    'une session ouverte sans échéance est refusée à la création'
  );

  v_err := pg_temp.error_of(format(
    'select public.create_session(%L, %L::uuid[], now() + interval ''1 hour'', %L::jsonb)',
    'Un seul resto', v_ids[1:1], '{"open": true}'
  ));
  perform pg_temp.assert(
    v_err = 'omk:not_enough_restaurants',
    'une session ouverte exige deux restos dès la création : personne ne pourra en ajouter'
  );

  v_err := pg_temp.error_of(format(
    'select public.create_session(%L, %L::uuid[], now() + interval ''1 hour'', %L::jsonb)',
    'Mode illisible', v_ids, '{"open": "oui"}'
  ));
  perform pg_temp.assert(v_err = 'omk:invalid_rules', 'un mode qui n''est pas un booléen est refusé');

  -- Le seuil réglé avant de cocher « ouverte » ne fait pas échouer la
  -- création : il est neutralisé.
  v_session := public.create_session(
    'Midi ouvert', v_ids, now() + interval '1 hour',
    '{"open": true, "close_at_ratio": 0.5, "vetos": 2}'::jsonb
  );
  insert into t_sessions (label, id) values ('open', v_session.id);

  perform pg_temp.assert(v_session.status = 'voting', 'la session ouverte part directement en vote');
  perform pg_temp.assert(v_session.launched_at is not null, '`launched_at` est posé dès la création');
  perform pg_temp.assert(
    v_session.rules = '{"superlikes": 1, "vetos": 2, "close_at_ratio": 1, "open": true}'::jsonb,
    'les règles gardent les jokers, marquent le mode et ramènent le seuil à 100 %'
  );

  v_session := public.create_session(
    'Midi ordinaire', v_ids, null, '{"open": false}'::jsonb
  );
  insert into t_sessions (label, id) values ('ordinary', v_session.id);
  perform pg_temp.assert(v_session.status = 'waiting', 'une session ordinaire garde sa salle d''attente');
  perform pg_temp.assert(
    v_session.rules = public.default_session_rules(),
    '`open: false` n''est pas écrit : les règles d''une session ordinaire sont celles d''avant'
  );
end;
$$;

-- ============================================================
-- 2. Le mode est figé dès la création
-- ============================================================
reset role;

do $$
declare
  v_open uuid := (select id from t_sessions where label = 'open');
  v_ordinary uuid := (select id from t_sessions where label = 'ordinary');
  v_err text;
begin
  raise notice '2. mode figé';

  v_err := pg_temp.error_of(format(
    'update public.sessions set rules = rules - %L where id = %L', 'open', v_open
  ));
  perform pg_temp.assert(v_err = 'omk:rules_locked', 'une session ouverte ne redevient pas ordinaire');

  -- Même en salle d'attente, où les jokers restent modifiables.
  v_err := pg_temp.error_of(format(
    'update public.sessions set rules = rules || %L::jsonb where id = %L', '{"open": true}', v_ordinary
  ));
  perform pg_temp.assert(
    v_err = 'omk:rules_locked',
    'une session ordinaire en attente ne devient pas ouverte'
  );

  v_err := pg_temp.error_of(format(
    'update public.sessions set closes_at = null where id = %L', v_open
  ));
  perform pg_temp.assert(
    v_err like '%sessions_open_needs_deadline%',
    'la table refuse une session ouverte sans échéance'
  );
end;
$$;

-- Codes d'invitation, lus hors RLS : les arrivants ne sont pas encore
-- participants.
select s.invite_code as open_code
  from public.sessions s join t_sessions t on t.id = s.id
 where t.label = 'open' \gset
select s.invite_code as ordinary_code
  from public.sessions s join t_sessions t on t.id = s.id
 where t.label = 'ordinary' \gset

-- ============================================================
-- 3. Aperçu anonyme : le lien déplié dans la conversation
-- ============================================================
set local role anon;
select set_config('request.jwt.claims', '', true);

select count(*) = 1 as preview_open from public.session_preview(:'open_code') \gset
select pg_temp.assert(:'preview_open'::boolean, 'l''aperçu anonyme d''une session ouverte existe');

-- ============================================================
-- 4. L'hôte vote tout : la session reste ouverte
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_open uuid := (select id from t_sessions where label = 'open');
  v_a uuid;
  v_b uuid;
  v_c uuid;
begin
  raise notice '4. l''hôte vote seul';

  select id into v_a from public.session_restaurants where session_id = v_open and position = 0;
  select id into v_b from public.session_restaurants where session_id = v_open and position = 1;
  select id into v_c from public.session_restaurants where session_id = v_open and position = 2;

  -- A +2, B +1, C 0
  perform public.submit_vote(v_open, v_a, 2::smallint);
  perform public.submit_vote(v_open, v_b, 1::smallint);
  perform public.submit_vote(v_open, v_c, 0::smallint);

  perform pg_temp.assert(
    (select has_finished_voting from public.session_participants
      where session_id = v_open and profile_id = (select auth.uid())),
    'l''hôte a terminé'
  );
  perform pg_temp.assert(
    (select status from public.sessions where id = v_open) = 'voting',
    '100 % des participants ont fini, la session ouverte reste en vote'
  );

  perform pg_temp.assert(
    public.invite_group_to_session('a5555555-5555-4555-8555-555555555555', v_open) = 1,
    'un groupe s''invite pendant le vote d''une session ouverte'
  );
end;
$$;


-- ============================================================
-- 5. Session ordinaire : le refus pendant le vote ne change pas
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"' || :'late' || '","role":"authenticated"}', true);
select (public.join_session(:'ordinary_code')).status as ordinary_joined_status \gset

select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);
select (public.launch_session(id)).status as ordinary_status
  from t_sessions where label = 'ordinary' \gset
select pg_temp.assert(:'ordinary_status' = 'voting', 'la session ordinaire est lancée par l''hôte');

select set_config('request.jwt.claims', '{"sub":"' || :'silent' || '","role":"authenticated"}', true);
select coalesce(pg_temp.error_of(format('select public.join_session(%L)', :'ordinary_code')), '')
  as ordinary_err \gset
select pg_temp.assert(
  :'ordinary_err' = 'omk:session_started',
  'une session ordinaire refuse toujours une arrivée pendant le vote, avec son code dédié'
);

-- ============================================================
-- 6. Session ouverte : on entre pendant le vote
-- ============================================================
-- L'invité du groupe voit son invitation, entre, et ne vote pas.
select pg_temp.assert(
  exists (select 1 from public.my_session_invitations() i
          where i.session_id = (select id from t_sessions where label = 'open')),
  'l''invitation vers une session ouverte en cours de vote reste visible'
);

select (public.join_session(:'open_code')).status as silent_joined_status \gset
select pg_temp.assert(:'silent_joined_status' = 'voting', 'l''invité entre pendant le vote');
select pg_temp.assert(
  not exists (select 1 from public.my_session_invitations()),
  'son invitation est consommée en entrant'
);

do $$
declare
  v_open uuid := (select id from t_sessions where label = 'open');
  v_other uuid := (select id from public.restaurants
                   where id not in (select id from t_resto) order by name limit 1);
  v_err text;
begin
  v_err := pg_temp.error_of(
    format('select public.add_session_restaurant(%L, %L)', v_open, v_other)
  );
  perform pg_temp.assert(
    v_err = 'omk:session_already_started',
    'personne n''ajoute de resto à une session ouverte : le deck est le même pour tous'
  );
end;
$$;

-- Le retardataire arrive plus tard, vote sur le même instantané et termine.
select set_config('request.jwt.claims', '{"sub":"' || :'late' || '","role":"authenticated"}', true);
select (public.join_session(:'open_code')).status as late_joined_status \gset

do $$
declare
  v_open uuid := (select id from t_sessions where label = 'open');
  v_a uuid;
  v_b uuid;
  v_c uuid;
begin
  raise notice '6. arrivée tardive';

  perform pg_temp.assert(
    (select count(*) from public.session_restaurants where session_id = v_open) = 3,
    'l''arrivant voit les trois mêmes restos que l''hôte'
  );

  select id into v_a from public.session_restaurants where session_id = v_open and position = 0;
  select id into v_b from public.session_restaurants where session_id = v_open and position = 1;
  select id into v_c from public.session_restaurants where session_id = v_open and position = 2;

  -- A +1, B +2, C veto
  perform public.submit_vote(v_open, v_a, 1::smallint);
  perform public.submit_vote(v_open, v_b, 2::smallint);
  perform public.submit_vote(v_open, v_c, (-2)::smallint);

  perform pg_temp.assert(
    (select has_finished_voting from public.session_participants
      where session_id = v_open and profile_id = (select auth.uid())),
    'l''arrivant tardif a terminé'
  );
  perform pg_temp.assert(
    (select status from public.sessions where id = v_open) = 'voting',
    'la session reste ouverte jusqu''à l''échéance'
  );
end;
$$;

-- ============================================================
-- 7. L'échéance tombe : plus d'arrivée, clôture, classement
-- ============================================================
reset role;
update public.sessions
  set closes_at = now() - interval '1 second'
  where id = (select id from t_sessions where label = 'open');

set local role anon;
select set_config('request.jwt.claims', '', true);
select count(*) = 0 as preview_gone from public.session_preview(:'open_code') \gset
select pg_temp.assert(:'preview_gone'::boolean, 'passé l''échéance, l''aperçu anonyme disparaît');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'outside' || '","role":"authenticated"}', true);
select coalesce(pg_temp.error_of(format('select public.join_session(%L)', :'open_code')), '')
  as late_err \gset
select pg_temp.assert(
  :'late_err' = 'omk:session_closed',
  'passé l''échéance, on n''entre plus — même avant le passage du balayage'
);

reset role;
do $$
declare
  v_open uuid := (select id from t_sessions where label = 'open');
  v_session public.sessions;
begin
  raise notice '7. clôture à l''échéance';

  perform public.close_expired_sessions();
  select * into v_session from public.sessions where id = v_open;
  perform pg_temp.assert(v_session.status = 'closed', 'le balayage clôt la session ouverte échue');
  perform pg_temp.assert(v_session.closed_at is not null, '`closed_at` est posé');
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_open uuid := (select id from t_sessions where label = 'open');
  v_row record;
begin
  -- A : 2 + 1 = 3 · B : 1 + 2 = 3 · C : 0 − 2 = −2 ; le silencieux compte 0.
  select * into v_row from public.session_results(v_open) where restaurant_position = 0;
  perform pg_temp.assert(v_row.score = 3 and v_row.rank = 1, 'A : 3 points, premier');
  perform pg_temp.assert(v_row.votes_count = 2, 'A : deux bulletins, le silencieux n''en a pas');

  select * into v_row from public.session_results(v_open) where restaurant_position = 1;
  perform pg_temp.assert(v_row.score = 3 and v_row.rank = 1, 'B : 3 points, premier ex æquo');
  perform pg_temp.assert(v_row.tiebreak = 'tied', 'A et B sont à départager');

  select * into v_row from public.session_results(v_open) where restaurant_position = 2;
  perform pg_temp.assert(v_row.score = -2 and v_row.rank = 3, 'C : −2 points, troisième');
end;
$$;

-- ============================================================
-- 8. Le second tour n'hérite pas du mode ouvert
-- ============================================================
do $$
declare
  v_open uuid := (select id from t_sessions where label = 'open');
  v_runoff public.sessions;
begin
  raise notice '8. second tour';

  v_runoff := public.create_runoff_session(v_open);
  insert into t_sessions (label, id) values ('runoff', v_runoff.id);

  perform pg_temp.assert(v_runoff.status = 'voting', 'le second tour démarre en vote');
  perform pg_temp.assert(
    not public.session_is_open(v_runoff.rules) and not (v_runoff.rules ? 'open'),
    'le second tour n''est pas ouvert'
  );
  perform pg_temp.assert(
    (v_runoff.rules ->> 'vetos')::int = 2,
    'il reprend les jokers du premier tour'
  );
  perform pg_temp.assert(v_runoff.closes_at is null, 'il n''hérite d''aucune échéance');
  perform pg_temp.assert(
    (select count(*) from public.session_participants where session_id = v_runoff.id) = 2,
    'seuls ceux qui ont voté au premier tour sont conviés'
  );
end;
$$;

-- Les deux votants tranchent : le second tour se clôt tout seul, à 100 %.
do $$
declare
  v_runoff uuid := (select id from t_sessions where label = 'runoff');
  v_sr uuid;
begin
  for v_sr in select id from public.session_restaurants where session_id = v_runoff loop
    perform public.submit_vote(v_runoff, v_sr, 1::smallint);
  end loop;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'late' || '","role":"authenticated"}', true);

do $$
declare
  v_runoff uuid := (select id from t_sessions where label = 'runoff');
  v_sr uuid;
begin
  for v_sr in select id from public.session_restaurants where session_id = v_runoff order by position loop
    perform public.submit_vote(v_runoff, v_sr, 0::smallint);
  end loop;

  perform pg_temp.assert(
    (select status from public.sessions where id = v_runoff) = 'closed',
    'le second tour se clôt quand ses votants ont fini, comme un second tour ordinaire'
  );
end;
$$;

select set_config('request.jwt.claims', '', true);
reset role;

rollback;
