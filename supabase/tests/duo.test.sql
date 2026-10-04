-- ============================================================
-- onmangekoi — scénario : mode duo
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #61 :
--   * un duo part directement en `voting`, sans salle d'attente ; il ne se
--     combine pas avec une session ouverte, et ramène le seuil à 100 % ;
--   * le mode est figé dès la création, la table refuse un duo en attente ;
--   * aucune table nouvelle : tout vit dans `sessions.rules` ;
--   * le premier vote seul, avant l'arrivée de l'autre, sans rien fermer ;
--   * le lien suffit au second : l'aperçu anonyme existe tant qu'une place
--     est libre ; un troisième est refusé (`omk:duo_full`), par la RPC comme
--     par la table ;
--   * « bof » et veto ne font pas accord ; le premier « ça me va » commun
--     ferme la session et pose la décision dans la foulée ;
--   * sans accord à la fin des deux decks, clôture et classement habituels ;
--     le second tour reste un duo ;
--   * passé l'échéance d'un duo qui en a une, on n'entre plus.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/duo.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set host    'd1111111-1111-4111-8111-111111111111'
\set partner 'd2222222-2222-4222-8222-222222222222'
\set third   'd3333333-3333-4333-8333-333333333333'

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

-- Vote d'un participant sur le restaurant à la position donnée.
create or replace function pg_temp.vote(p_session uuid, p_position int, p_value int)
  returns void
  language plpgsql
as $$
begin
  perform public.submit_vote(
    p_session,
    (select id from public.session_restaurants
      where session_id = p_session and position = p_position),
    p_value::smallint
  );
end;
$$;

-- ─── FIXTURES ────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'host', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Moi"}'::jsonb, true),
  (:'partner', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Toi"}'::jsonb, true),
  (:'third', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Tiers"}'::jsonb, true);

-- Trois restaurants, dans un ordre stable : A, B, C.
create temporary table t_resto as
select id, row_number() over (order by name) as ord
from (select id, name from public.restaurants order by name limit 3) s;

create temporary table t_sessions (label text primary key, id uuid not null);

grant select on t_resto to authenticated;
grant select, insert on t_sessions to authenticated;

-- ============================================================
-- 1. Création : pas de salle d'attente, pas de seuil, pas d'ouverte
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
    'select public.create_session(%L, %L::uuid[], now() + interval ''1 hour'', %L::jsonb)',
    'Duo ouvert', v_ids, '{"duo": true, "open": true}'
  ));
  perform pg_temp.assert(v_err = 'omk:invalid_rules', 'un duo ne peut pas être une session ouverte');

  v_err := pg_temp.error_of(format(
    'select public.create_session(%L, %L::uuid[], null, %L::jsonb)',
    'Un seul resto', v_ids[1:1], '{"duo": true}'
  ));
  perform pg_temp.assert(
    v_err = 'omk:not_enough_restaurants',
    'un duo exige deux restos dès la création : personne ne pourra en ajouter'
  );

  v_err := pg_temp.error_of(format(
    'select public.create_session(%L, %L::uuid[], null, %L::jsonb)',
    'Mode illisible', v_ids, '{"duo": 1}'
  ));
  perform pg_temp.assert(v_err = 'omk:invalid_rules', 'un mode qui n''est pas un booléen est refusé');

  -- Sans échéance : elle reste facultative en duo. Le seuil envoyé est
  -- neutralisé, les jokers gardés.
  v_session := public.create_session(
    'À deux', v_ids, null, '{"duo": true, "close_at_ratio": 0.5, "superlikes": 2}'::jsonb
  );
  insert into t_sessions (label, id) values ('agree', v_session.id);

  perform pg_temp.assert(v_session.status = 'voting', 'le duo part directement en vote');
  perform pg_temp.assert(v_session.launched_at is not null, '`launched_at` est posé dès la création');
  perform pg_temp.assert(v_session.closes_at is null, 'un duo se passe d''échéance');
  perform pg_temp.assert(
    v_session.rules = '{"superlikes": 2, "vetos": 1, "close_at_ratio": 1, "duo": true}'::jsonb,
    'les règles gardent les jokers, marquent le duo et ramènent le seuil à 100 %'
  );

  v_session := public.create_session('Sans accord', v_ids, null, '{"duo": true}'::jsonb);
  insert into t_sessions (label, id) values ('noagree', v_session.id);

  v_session := public.create_session(
    'Avant ce soir', v_ids, now() + interval '1 hour', '{"duo": true}'::jsonb
  );
  insert into t_sessions (label, id) values ('deadline', v_session.id);

  v_session := public.create_session('Ordinaire', v_ids, null, '{"duo": false}'::jsonb);
  insert into t_sessions (label, id) values ('ordinary', v_session.id);
  perform pg_temp.assert(
    v_session.status = 'waiting' and v_session.rules = public.default_session_rules(),
    '`duo: false` n''est pas écrit : une session ordinaire garde ses règles et sa salle d''attente'
  );
end;
$$;

-- ============================================================
-- 2. Le mode est figé, la table porte les garanties
-- ============================================================
reset role;

do $$
declare
  v_duo uuid := (select id from t_sessions where label = 'agree');
  v_ordinary uuid := (select id from t_sessions where label = 'ordinary');
  v_err text;
begin
  raise notice '2. mode figé';

  v_err := pg_temp.error_of(format(
    'update public.sessions set rules = rules - %L where id = %L', 'duo', v_duo
  ));
  perform pg_temp.assert(v_err = 'omk:rules_locked', 'un duo ne redevient pas une session ordinaire');

  v_err := pg_temp.error_of(format(
    'update public.sessions set rules = rules || %L::jsonb where id = %L', '{"duo": true}', v_ordinary
  ));
  perform pg_temp.assert(v_err = 'omk:rules_locked', 'une session en attente ne devient pas un duo');

  v_err := pg_temp.error_of(format(
    'update public.sessions set status = %L where id = %L', 'waiting', v_duo
  ));
  perform pg_temp.assert(
    v_err like '%sessions_duo_skips_waiting%',
    'la table refuse un duo en salle d''attente'
  );

  perform pg_temp.assert(
    not exists (
      select 1 from pg_tables
      where schemaname = 'public' and tablename like '%duo%'
    ),
    'aucune table nouvelle : le duo est une règle de session'
  );
end;
$$;

select s.invite_code as agree_code
  from public.sessions s join t_sessions t on t.id = s.id
 where t.label = 'agree' \gset
select s.invite_code as noagree_code
  from public.sessions s join t_sessions t on t.id = s.id
 where t.label = 'noagree' \gset
select s.invite_code as deadline_code
  from public.sessions s join t_sessions t on t.id = s.id
 where t.label = 'deadline' \gset

-- ============================================================
-- 3. Le premier vote seul : rien ne se ferme sans l'autre
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_agree uuid := (select id from t_sessions where label = 'agree');
  v_noagree uuid := (select id from t_sessions where label = 'noagree');
begin
  raise notice '3. le premier vote seul';

  -- Duo « accord » : A bof, B ça me va — C reste à voter.
  perform pg_temp.vote(v_agree, 0, 0);
  perform pg_temp.vote(v_agree, 1, 1);

  -- Duo « sans accord » : A ça me va, B bof, C veto — deck terminé.
  perform pg_temp.vote(v_noagree, 0, 1);
  perform pg_temp.vote(v_noagree, 1, 0);
  perform pg_temp.vote(v_noagree, 2, -2);

  perform pg_temp.assert(
    (select has_finished_voting from public.session_participants
      where session_id = v_noagree and profile_id = (select auth.uid())),
    'le premier a fini son deck'
  );
  perform pg_temp.assert(
    (select status from public.sessions where id = v_noagree) = 'voting',
    'seul dans le duo, finir son deck ne ferme rien : l''autre n''a pas encore ouvert le lien'
  );
end;
$$;

-- ============================================================
-- 4. Le lien suffit : aperçu anonyme tant qu'une place est libre
-- ============================================================
set local role anon;
select set_config('request.jwt.claims', '', true);

select count(*) = 1 as preview_free from public.session_preview(:'agree_code') \gset
select pg_temp.assert(
  :'preview_free'::boolean,
  'l''aperçu anonyme d''un duo en cours existe tant que la seconde place est libre'
);

-- ============================================================
-- 5. Le second arrive sur le deck, le troisième est refusé
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'partner' || '","role":"authenticated"}', true);

select (public.join_session(:'agree_code')).status as partner_status \gset
select pg_temp.assert(:'partner_status' = 'voting', 'le second entre directement pendant le vote');
select (public.join_session(:'agree_code')).status as partner_again \gset
select pg_temp.assert(:'partner_again' = 'voting', 'rouvrir le lien reste idempotent pour qui est déjà là');
select (public.join_session(:'noagree_code')).status as partner_noagree \gset

set local role anon;
select set_config('request.jwt.claims', '', true);
select count(*) = 0 as preview_full from public.session_preview(:'agree_code') \gset
select pg_temp.assert(:'preview_full'::boolean, 'un duo complet ne se montre plus aux anonymes');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'third' || '","role":"authenticated"}', true);
select coalesce(pg_temp.error_of(format('select public.join_session(%L)', :'agree_code')), '')
  as third_err \gset
select pg_temp.assert(:'third_err' = 'omk:duo_full', 'un troisième est refusé avec son code dédié');

reset role;
do $$
declare
  v_agree uuid := (select id from t_sessions where label = 'agree');
  v_err text;
begin
  v_err := pg_temp.error_of(format(
    'insert into public.session_participants (session_id, profile_id) values (%L, %L)',
    v_agree, 'd3333333-3333-4333-8333-333333333333'
  ));
  perform pg_temp.assert(
    v_err = 'omk:duo_full',
    'la table elle-même refuse une troisième place, quelle que soit la route'
  );
end;
$$;

-- ============================================================
-- 6. « Bof » et veto ne font pas accord ; le premier accord ferme
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'partner' || '","role":"authenticated"}', true);

do $$
declare
  v_agree uuid := (select id from t_sessions where label = 'agree');
  v_session public.sessions;
  v_b uuid;
begin
  raise notice '6. premier accord';

  -- A : l'autre a dit bof — ça me va de ce côté-ci ne suffit pas.
  perform pg_temp.vote(v_agree, 0, 1);
  perform pg_temp.assert(
    (select status from public.sessions where id = v_agree) = 'voting',
    '« ça me va » contre « bof » ne fait pas accord'
  );

  -- B : l'autre a dit ça me va, coup de cœur ici — c'est d'accord.
  perform pg_temp.vote(v_agree, 1, 2);

  select * into v_session from public.sessions where id = v_agree;
  select restaurant_id into v_b
    from public.session_restaurants where session_id = v_agree and position = 1;

  perform pg_temp.assert(v_session.status = 'closed', 'le premier accord ferme la session aussitôt');
  perform pg_temp.assert(v_session.closed_at is not null, '`closed_at` est posé');
  perform pg_temp.assert(
    v_session.decided_restaurant_id = v_b and v_session.decided_at is not null,
    'la décision est posée dans la foulée, sur le restaurant de l''accord'
  );
  perform pg_temp.assert(
    exists (select 1 from public.session_results(v_agree) r where r.decided and r.restaurant_id = v_b),
    'le classement signale la décision sur la ligne de l''accord'
  );
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_agree uuid := (select id from t_sessions where label = 'agree');
  v_err text;
begin
  v_err := pg_temp.error_of(format(
    'select pg_temp.vote(%L, 2, 1)', v_agree
  ));
  perform pg_temp.assert(
    v_err = 'omk:session_not_voting',
    'pour l''autre aussi, le vote est fini : son bulletin suivant est refusé'
  );
end;
$$;

-- ============================================================
-- 7. Sans accord à la fin des deux decks : le classement habituel
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"' || :'partner' || '","role":"authenticated"}', true);

do $$
declare
  v_noagree uuid := (select id from t_sessions where label = 'noagree');
  v_session public.sessions;
  v_row record;
begin
  raise notice '7. sans accord';

  -- A bof (l'autre : ça me va), B ça me va (l'autre : bof), C ça me va
  -- (l'autre : veto). Aucun restaurant n'a deux « ça me va ».
  perform pg_temp.vote(v_noagree, 0, 0);
  perform pg_temp.vote(v_noagree, 1, 1);
  perform pg_temp.assert(
    (select status from public.sessions where id = v_noagree) = 'voting',
    'tant qu''un deck n''est pas fini, le duo sans accord reste en vote'
  );
  perform pg_temp.vote(v_noagree, 2, 1);

  select * into v_session from public.sessions where id = v_noagree;
  perform pg_temp.assert(
    v_session.status = 'closed',
    'les deux decks finis sans accord : clôture habituelle'
  );
  perform pg_temp.assert(
    v_session.decided_restaurant_id is null,
    'veto contre « ça me va » ne fait pas accord : aucune décision posée'
  );

  -- A : 1 + 0 = 1 · B : 0 + 1 = 1 · C : −2 + 1 = −1
  select * into v_row from public.session_results(v_noagree) where restaurant_position = 0;
  perform pg_temp.assert(v_row.score = 1 and v_row.rank = 1, 'A : 1 point, premier');
  perform pg_temp.assert(v_row.tiebreak = 'tied', 'A et B sont à départager, comme ailleurs');
  select * into v_row from public.session_results(v_noagree) where restaurant_position = 2;
  perform pg_temp.assert(v_row.score = -1 and v_row.rank = 3, 'C : −1 point, troisième');
end;
$$;

-- Le second tour d'un duo reste un duo : le premier accord le ferme.
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_noagree uuid := (select id from t_sessions where label = 'noagree');
  v_runoff public.sessions;
begin
  raise notice '7 bis. second tour';

  v_runoff := public.create_runoff_session(v_noagree);
  insert into t_sessions (label, id) values ('runoff', v_runoff.id);

  perform pg_temp.assert(public.session_is_duo(v_runoff.rules), 'le second tour d''un duo est un duo');
  perform pg_temp.assert(
    (select count(*) from public.session_participants where session_id = v_runoff.id) = 2,
    'les deux mêmes participants y sont conviés'
  );

  perform pg_temp.vote(v_runoff.id, 0, 1);
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'partner' || '","role":"authenticated"}', true);

do $$
declare
  v_runoff uuid := (select id from t_sessions where label = 'runoff');
begin
  perform pg_temp.vote(v_runoff, 0, 1);
  perform pg_temp.assert(
    (select status from public.sessions where id = v_runoff) = 'closed'
      and (select decided_restaurant_id from public.sessions where id = v_runoff) is not null,
    'au second tour aussi, le premier accord ferme et décide'
  );
end;
$$;

-- ============================================================
-- 8. Un duo avec échéance : passé l'heure, on n'entre plus
-- ============================================================
reset role;
update public.sessions
  set closes_at = now() - interval '1 second'
  where id = (select id from t_sessions where label = 'deadline');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'third' || '","role":"authenticated"}', true);
select coalesce(pg_temp.error_of(format('select public.join_session(%L)', :'deadline_code')), '')
  as deadline_err \gset
select pg_temp.assert(
  :'deadline_err' = 'omk:session_closed',
  'passé l''échéance d''un duo, on n''entre plus'
);

select set_config('request.jwt.claims', '', true);
reset role;

rollback;
