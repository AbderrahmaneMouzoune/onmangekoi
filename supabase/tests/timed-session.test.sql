-- ============================================================
-- onmangekoi — scénario : vote chronométré
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #9 :
--   * une échéance choisie à la création est bornée en base (trop proche,
--     trop lointaine) ;
--   * `launch_session` refuse de démarrer un vote déjà échu — que rien ne
--     clôturerait, le balayage ne visant que les sessions `voting` ;
--   * `extend_session` est réservée au host, ajoute bien ses minutes et
--     repart de `now()` quand l'échéance vient de passer ;
--   * `close_expired_sessions` clôture exactement comme la clôture manuelle
--     — `status`, `closed_at`, classement avec les votes manquants à 0 —
--     et ne touche ni aux sessions en attente ni aux échéances à venir.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/timed-session.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set host  '11111111-1111-4111-8111-111111111111'
\set guest '22222222-2222-4222-8222-222222222222'

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
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'host', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Hôte"}'::jsonb, true),
  (:'guest', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Invité"}'::jsonb, true);

create temporary table t_resto as
select id from (select id, name from public.restaurants order by name limit 2) s;

create temporary table t_sessions (label text primary key, id uuid not null);

-- Les tables de travail appartiennent à `postgres` : sans ce droit, les blocs
-- joués sous le rôle `authenticated` ne les liraient pas.
grant select on t_resto to authenticated;
grant select, insert on t_sessions to authenticated;

-- ============================================================
-- 1. Échéance à la création : bornes vérifiées en base
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_ids uuid[] := (select array_agg(id) from t_resto);
  v_session public.sessions;
  v_err text;
begin
  raise notice '1. création avec échéance';

  v_session := public.create_session('Midi chronométré', v_ids, now() + interval '10 minutes');
  perform pg_temp.assert(
    v_session.closes_at between now() + interval '9 minutes' and now() + interval '11 minutes',
    'l''échéance choisie est enregistrée telle quelle'
  );
  perform pg_temp.assert(v_session.status = 'waiting', 'la session démarre en attente');

  v_session := public.create_session('Midi sans limite', v_ids);
  perform pg_temp.assert(
    v_session.closes_at is null,
    'sans échéance, la colonne reste nulle (comportement d''avant)'
  );

  v_err := pg_temp.error_of(
    format('select public.create_session(%L, %L::uuid[], now() + interval ''30 seconds'')',
           'Trop proche', v_ids)
  );
  perform pg_temp.assert(v_err = 'omk:deadline_too_soon', 'échéance à moins d''une minute refusée');

  v_err := pg_temp.error_of(
    format('select public.create_session(%L, %L::uuid[], now() + interval ''13 hours'')',
           'Trop loin', v_ids)
  );
  perform pg_temp.assert(v_err = 'omk:deadline_too_far', 'échéance au-delà de 12 h refusée');
end;
$$;

-- ============================================================
-- 2. Prolongation : réservée au host, bornée, repart de now()
-- ============================================================
do $$
declare
  v_ids uuid[] := (select array_agg(id) from t_resto);
  v_session public.sessions;
  v_before timestamptz;
  v_after public.sessions;
  v_err text;
begin
  raise notice '2. prolongation';

  v_session := public.create_session('Prolongeable', v_ids, now() + interval '10 minutes');
  v_before := v_session.closes_at;

  v_after := public.extend_session(v_session.id);
  perform pg_temp.assert(
    v_after.closes_at = v_before + interval '5 minutes',
    'la prolongation par défaut ajoute 5 minutes'
  );

  v_err := pg_temp.error_of(format('select public.extend_session(%L, 0)', v_session.id));
  perform pg_temp.assert(v_err = 'omk:invalid_extension', 'une prolongation de 0 minute est refusée');

  v_session := public.create_session('Sans échéance', v_ids);
  v_err := pg_temp.error_of(format('select public.extend_session(%L)', v_session.id));
  perform pg_temp.assert(v_err = 'omk:no_deadline', 'prolonger une session sans échéance est refusé');
end;
$$;

-- ============================================================
-- 3. Lancement : un vote déjà échu ne démarre pas
-- ============================================================
do $$
declare
  v_ids uuid[] := (select array_agg(id) from t_resto);
  v_session public.sessions;
begin
  v_session := public.create_session('À lancer', v_ids, now() + interval '10 minutes');
  insert into t_sessions (label, id) values ('launch', v_session.id);
end;
$$;

-- L'invité rejoint : le lancement exige deux participants. Le code se lit
-- hors RLS — l'invité, pas encore participant, ne verrait pas la session.
reset role;
select s.invite_code as launch_code
  from public.sessions s
  join t_sessions t on t.id = s.id
 where t.label = 'launch' \gset
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"' || :'guest' || '","role":"authenticated"}', true);
select public.join_session(:'launch_code');

do $$
declare
  v_err text;
begin
  v_err := pg_temp.error_of(
    format('select public.extend_session(%L)', (select id from t_sessions where label = 'launch'))
  );
  perform pg_temp.assert(v_err = 'omk:host_only', 'un participant ne peut pas prolonger la session');
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

-- L'échéance passe avant que le host n'ait lancé.
reset role;
update public.sessions
  set closes_at = now() - interval '1 minute'
  where id = (select id from t_sessions where label = 'launch');
set local role authenticated;

do $$
declare
  v_id uuid := (select id from t_sessions where label = 'launch');
  v_err text;
  v_session public.sessions;
begin
  raise notice '3. lancement et échéance dépassée';

  v_err := pg_temp.error_of(format('select public.launch_session(%L)', v_id));
  perform pg_temp.assert(v_err = 'omk:deadline_passed', 'lancer après l''échéance est refusé');

  v_session := public.extend_session(v_id);
  perform pg_temp.assert(
    v_session.closes_at > now() + interval '4 minutes',
    'prolonger une échéance passée repart de maintenant'
  );

  v_session := public.launch_session(v_id);
  perform pg_temp.assert(v_session.status = 'voting', 'le vote démarre une fois prolongé');
end;
$$;

-- ============================================================
-- 4. Clôture par échéance : même écriture que la clôture manuelle
-- ============================================================
-- Le host vote son coup de cœur sur le premier resto ; l'invité ne vote pas.
do $$
declare
  v_id uuid := (select id from t_sessions where label = 'launch');
  v_first uuid;
begin
  select id into v_first from public.session_restaurants
   where session_id = v_id order by position limit 1;
  perform public.submit_vote(v_id, v_first, 2::smallint);
end;
$$;

-- Deux témoins que le balayage ne doit pas toucher : une session en attente
-- dont l'échéance est passée, une session en cours dont elle est à venir.
reset role;
do $$
declare
  v_host uuid := (select host_id from public.sessions s
                  join t_sessions t on t.id = s.id where t.label = 'launch');
  v_id uuid;
begin
  insert into public.sessions (name, host_id, status, closes_at)
  values ('En attente échue', v_host, 'waiting', now() - interval '1 minute')
  returning id into v_id;
  insert into t_sessions (label, id) values ('waiting', v_id);

  insert into public.sessions (name, host_id, status, launched_at, closes_at)
  values ('En cours à venir', v_host, 'voting', now(), now() + interval '1 hour')
  returning id into v_id;
  insert into t_sessions (label, id) values ('future', v_id);
end;
$$;

-- L'échéance de la session lancée tombe.
update public.sessions
  set closes_at = now() - interval '1 second'
  where id = (select id from t_sessions where label = 'launch');

do $$
declare
  v_launch uuid := (select id from t_sessions where label = 'launch');
  v_closed integer;
  v_session public.sessions;
begin
  raise notice '4. clôture par échéance';

  v_closed := public.close_expired_sessions();
  perform pg_temp.assert(v_closed = 1, 'une seule session échue est clôturée');

  select * into v_session from public.sessions where id = v_launch;
  perform pg_temp.assert(v_session.status = 'closed', 'la session échue passe en `closed`');
  perform pg_temp.assert(
    v_session.closed_at is not null,
    '`closed_at` est posé comme lors d''une clôture manuelle'
  );

  perform pg_temp.assert(
    (select status from public.sessions where id = (select id from t_sessions where label = 'waiting'))
      = 'waiting',
    'une session en attente échue n''est pas clôturée : elle n''a aucun vote'
  );
  perform pg_temp.assert(
    (select status from public.sessions where id = (select id from t_sessions where label = 'future'))
      = 'voting',
    'une échéance à venir ne clôture rien'
  );

  perform pg_temp.assert(
    exists (
      select 1 from public.maintenance_runs
      where task = 'close_expired_sessions'
        and purged ->> 'closed_sessions' = '1'
    ),
    'le passage est journalisé avec son compteur'
  );

  perform pg_temp.assert(public.close_expired_sessions() = 0, 'un second passage ne reclôture rien');
end;
$$;

-- Le classement est celui d'une clôture forcée : le vote absent compte 0.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_launch uuid := (select id from t_sessions where label = 'launch');
  v_top record;
  v_last record;
begin
  select * into v_top from public.session_results(v_launch) where rank = 1;
  perform pg_temp.assert(v_top.score = 2, 'le coup de cœur vaut 2 dans le classement');
  perform pg_temp.assert(v_top.votes_count = 1, 'seul le vote exprimé est compté');

  select * into v_last from public.session_results(v_launch) order by rank desc limit 1;
  perform pg_temp.assert(v_last.score = 0, 'le resto que personne n''a voté reste à 0');
end;
$$;

select set_config('request.jwt.claims', '', true);
reset role;

rollback;
