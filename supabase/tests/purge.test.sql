-- ============================================================
-- onmangekoi — scénario SQL : purge des anonymes et des sessions
-- ============================================================
-- Couvre `public.purge_stale_sessions`, `public.purge_inactive_anonymous`
-- et `public.run_maintenance` (migration 20260905120000).
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/purge.test.sql
--
-- Le scénario s'exécute dans une transaction annulée à la fin : il ne
-- laisse aucune donnée derrière lui. Une assertion fausse lève une
-- exception et fait sortir psql en erreur.
-- ============================================================

\set ON_ERROR_STOP on

begin;

-- ─── OUTILLAGE ───────────────────────────────────────────────
create function pg_temp.check(p_label text, p_ok boolean, p_detail text default null)
  returns void
  language plpgsql
as $$
begin
  if p_ok then
    raise notice '  ok   %', p_label;
  else
    raise exception 'ÉCHEC : % — %', p_label, coalesce(p_detail, 'assertion fausse');
  end if;
end;
$$;

-- Crée un utilisateur `auth.users` (le trigger `on_auth_user_created`
-- crée le profil) et renvoie son id.
create function pg_temp.mk_user(
  p_pseudo       text,
  p_age          interval,
  p_anonymous    boolean default true,
  p_email        text default null,
  p_email_change text default '',
  p_phone        text default null,
  p_last_sign_in interval default null
)
  returns uuid
  language plpgsql
as $$
declare
  v_id uuid;
begin
  -- `auth.users.id` n'a pas de valeur par défaut : c'est GoTrue qui la
  -- fournit, donc le scénario doit la générer lui-même.
  insert into auth.users (
    id, email, phone, email_change, raw_user_meta_data,
    is_anonymous, created_at, updated_at, last_sign_in_at
  )
  values (
    gen_random_uuid(), p_email, p_phone, p_email_change, jsonb_build_object('pseudo', p_pseudo),
    p_anonymous, now() - p_age, now() - p_age,
    case when p_last_sign_in is null then null else now() - p_last_sign_in end
  )
  returning id into v_id;
  return v_id;
end;
$$;

create function pg_temp.mk_session(
  p_name     text,
  p_host     uuid,
  p_status   public.session_status,
  p_age      interval,
  p_launched interval default null,
  p_closed   interval default null
)
  returns uuid
  language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.sessions (name, host_id, status, created_at, launched_at, closed_at)
  values (
    p_name, p_host, p_status, now() - p_age,
    case when p_launched is null then null else now() - p_launched end,
    case when p_closed is null then null else now() - p_closed end
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================
-- 1. purge_stale_sessions
-- ============================================================
do $$
declare
  v_host    uuid;
  v_waiting_old uuid;
  v_waiting_new uuid;
  v_voting  uuid;
  v_closed_old uuid;
  v_closed_new uuid;
  v_res     record;
begin
  raise notice '1. purge_stale_sessions';

  v_host := pg_temp.mk_user('Hôte récent', interval '2 days');

  v_waiting_old := pg_temp.mk_session('Waiting abandonnée', v_host, 'waiting', interval '30 days');
  v_waiting_new := pg_temp.mk_session('Waiting fraîche', v_host, 'waiting', interval '2 days');
  v_voting      := pg_temp.mk_session('Vote en cours', v_host, 'voting', interval '30 days', interval '29 days');
  v_closed_old  := pg_temp.mk_session('Close ancienne', v_host, 'closed', interval '210 days', interval '210 days', interval '200 days');
  v_closed_new  := pg_temp.mk_session('Close récente', v_host, 'closed', interval '20 days', interval '20 days', interval '10 days');

  select * into v_res from public.purge_stale_sessions();

  perform pg_temp.check(
    'compte des sessions waiting purgées',
    v_res.waiting_purged = 1,
    format('attendu 1, obtenu %s', v_res.waiting_purged)
  );
  perform pg_temp.check(
    'compte des sessions closed purgées',
    v_res.closed_purged = 1,
    format('attendu 1, obtenu %s', v_res.closed_purged)
  );

  perform pg_temp.check(
    'waiting de plus de 7 jours supprimée',
    not exists (select 1 from public.sessions where id = v_waiting_old)
  );
  perform pg_temp.check(
    'waiting récente conservée',
    exists (select 1 from public.sessions where id = v_waiting_new)
  );
  perform pg_temp.check(
    'session lancée conservée malgré son âge',
    exists (select 1 from public.sessions where id = v_voting)
  );
  perform pg_temp.check(
    'closed de plus de 180 jours supprimée',
    not exists (select 1 from public.sessions where id = v_closed_old)
  );
  perform pg_temp.check(
    'closed récente conservée',
    exists (select 1 from public.sessions where id = v_closed_new)
  );

  perform pg_temp.check(
    'passage journalisé avec les compteurs',
    exists (
      select 1 from public.maintenance_runs
      where task = 'purge_stale_sessions'
        and purged ->> 'waiting_sessions' = '1'
        and purged ->> 'closed_sessions' = '1'
    )
  );
end;
$$;

-- Rétention `null` : la catégorie est conservée (cas « on garde l'historique »).
do $$
declare
  v_host   uuid;
  v_closed uuid;
  v_res    record;
begin
  raise notice '2. purge_stale_sessions — rétention désactivée';

  v_host   := pg_temp.mk_user('Hôte bis', interval '2 days');
  v_closed := pg_temp.mk_session('Close à garder', v_host, 'closed', interval '400 days', interval '400 days', interval '390 days');

  select * into v_res from public.purge_stale_sessions(p_closed_older_than => null);

  perform pg_temp.check('aucune closed purgée quand la rétention est null', v_res.closed_purged = 0);
  perform pg_temp.check('closed ancienne conservée', exists (select 1 from public.sessions where id = v_closed));
end;
$$;

-- Une rétention trop courte est refusée (garde-fou contre un appel manuel raté).
do $$
declare
  v_raised boolean := false;
begin
  raise notice '3. purge_stale_sessions — garde-fou rétention';
  begin
    perform public.purge_stale_sessions(interval '1 hour');
  exception
    when others then v_raised := true;
  end;
  perform pg_temp.check('rétention < 1 jour refusée', v_raised);
end;
$$;

-- ============================================================
-- 4. purge_inactive_anonymous
-- ============================================================
do $$
declare
  v_old constant interval := interval '200 days';
  v_host_recent uuid;
  v_dormant     uuid;
  v_email_pending uuid;
  v_email_change  uuid;
  v_identity      uuid;
  v_registered    uuid;
  v_recent        uuid;
  v_signed_in     uuid;
  v_host_recent_session uuid;
  v_host_old_session    uuid;
  v_participant_recent  uuid;
  v_participant_live    uuid;
  v_with_list           uuid;
  v_phone               uuid;
  v_list                uuid;
  v_restaurant          uuid;
  v_session_recent uuid;
  v_session_live   uuid;
  v_purged integer;
begin
  raise notice '4. purge_inactive_anonymous';

  -- Anonyme dormant, sans la moindre activité : le seul cas nominal.
  v_dormant := pg_temp.mk_user('Dormant', v_old);

  -- Protégés parce qu'un moyen de reconnexion existe.
  v_email_pending := pg_temp.mk_user('Email en attente', v_old, true, 'pending@example.test');
  v_email_change  := pg_temp.mk_user('Email en cours', v_old, true, null, 'change@example.test');
  v_phone         := pg_temp.mk_user('Téléphone', v_old, true, null, '', '+33600000000');
  v_registered    := pg_temp.mk_user('Compte lié', v_old, false, 'compte@example.test');
  v_identity      := pg_temp.mk_user('Identité externe', v_old);
  insert into auth.identities (user_id, provider, provider_id, identity_data)
  values (
    v_identity, 'email', v_identity::text,
    jsonb_build_object('sub', v_identity::text, 'email', 'identite@example.test')
  );

  -- Protégés par la fraîcheur du compte.
  v_recent    := pg_temp.mk_user('Anonyme récent', interval '3 days');
  v_signed_in := pg_temp.mk_user('Revenu hier', v_old, true, null, '', null, interval '1 day');

  -- Protégés par leur activité métier.
  v_host_recent := pg_temp.mk_user('Hôte actif', interval '1 day');
  v_host_recent_session := pg_temp.mk_user('Hôte récent clos', v_old);
  v_host_old_session    := pg_temp.mk_user('Hôte ancien clos', v_old);
  v_participant_recent  := pg_temp.mk_user('Participant récent', v_old);
  v_participant_live    := pg_temp.mk_user('Participant en cours', v_old);

  perform pg_temp.mk_session('Close il y a 10 jours', v_host_recent_session, 'closed', interval '20 days', interval '20 days', interval '10 days');
  perform pg_temp.mk_session('Close il y a 200 jours', v_host_old_session, 'closed', interval '210 days', interval '210 days', v_old);

  v_session_recent := pg_temp.mk_session('Session close récente', v_host_recent, 'closed', interval '20 days', interval '20 days', interval '10 days');
  v_session_live   := pg_temp.mk_session('Session encore ouverte', v_host_recent, 'voting', interval '300 days', interval '300 days');

  insert into public.session_participants (session_id, profile_id, joined_at)
  values (v_session_recent, v_participant_recent, now() - interval '20 days');
  insert into public.session_participants (session_id, profile_id, joined_at)
  values (v_session_live, v_participant_live, now() - interval '300 days');

  -- Purgé, avec une liste qui doit disparaître en cascade.
  v_with_list := pg_temp.mk_user('Dormant à liste', v_old);
  insert into public.lists (name, owner_id) values ('Restos du bureau', v_with_list) returning id into v_list;
  select id into v_restaurant from public.restaurants limit 1;
  if v_restaurant is not null then
    insert into public.list_restaurants (list_id, restaurant_id) values (v_list, v_restaurant);
  end if;

  v_purged := public.purge_inactive_anonymous();

  perform pg_temp.check(
    'compte des anonymes purgés',
    v_purged = 3,
    format('attendu 3 (dormant, hôte ancien clos, dormant à liste), obtenu %s', v_purged)
  );

  perform pg_temp.check('anonyme dormant purgé', not exists (select 1 from auth.users where id = v_dormant));
  perform pg_temp.check('hôte d''une session close il y a 200 jours purgé', not exists (select 1 from auth.users where id = v_host_old_session));
  perform pg_temp.check('anonyme à liste purgé', not exists (select 1 from auth.users where id = v_with_list));

  perform pg_temp.check('email non confirmé jamais purgé', exists (select 1 from auth.users where id = v_email_pending));
  perform pg_temp.check('changement d''email en cours jamais purgé', exists (select 1 from auth.users where id = v_email_change));
  perform pg_temp.check('téléphone lié jamais purgé', exists (select 1 from auth.users where id = v_phone));
  perform pg_temp.check('compte lié jamais purgé', exists (select 1 from auth.users where id = v_registered));
  perform pg_temp.check('identité externe jamais purgée', exists (select 1 from auth.users where id = v_identity));
  perform pg_temp.check('anonyme récent conservé', exists (select 1 from auth.users where id = v_recent));
  perform pg_temp.check('connexion récente conserve le compte', exists (select 1 from auth.users where id = v_signed_in));
  perform pg_temp.check('hôte d''une session close récemment conservé', exists (select 1 from auth.users where id = v_host_recent_session));
  perform pg_temp.check('participant récent conservé', exists (select 1 from auth.users where id = v_participant_recent));
  perform pg_temp.check('participant d''une session ouverte conservé', exists (select 1 from auth.users where id = v_participant_live));

  perform pg_temp.check('profil supprimé en cascade', not exists (select 1 from public.profiles where id = v_with_list));
  perform pg_temp.check('liste supprimée en cascade', not exists (select 1 from public.lists where id = v_list));
  perform pg_temp.check('contenu de liste supprimé en cascade', not exists (select 1 from public.list_restaurants where list_id = v_list));

  perform pg_temp.check(
    'passage journalisé avec le nombre d''utilisateurs',
    exists (
      select 1 from public.maintenance_runs
      where task = 'purge_inactive_anonymous'
        and purged ->> 'anonymous_users' = '3'
    )
  );
end;
$$;

-- Garde-fou : une rétention trop courte est refusée.
do $$
declare
  v_raised boolean := false;
begin
  raise notice '5. purge_inactive_anonymous — garde-fou rétention';
  begin
    perform public.purge_inactive_anonymous(interval '1 hour');
  exception
    when others then v_raised := true;
  end;
  perform pg_temp.check('rétention < 1 jour refusée', v_raised);
end;
$$;

-- ============================================================
-- 6. run_maintenance — la cible du job pg_cron
-- ============================================================
do $$
declare
  v_before bigint;
  v_result jsonb;
begin
  raise notice '6. run_maintenance';

  select count(*) into v_before from public.maintenance_runs;
  v_result := public.run_maintenance();

  perform pg_temp.check(
    'les trois compteurs sont renvoyés',
    v_result ? 'waiting_sessions' and v_result ? 'closed_sessions' and v_result ? 'anonymous_users',
    v_result::text
  );
  perform pg_temp.check(
    'les deux tâches sont journalisées',
    (select count(*) from public.maintenance_runs) = v_before + 2
  );
end;
$$;

do $$
begin
  raise notice 'Scénario de purge : toutes les assertions passent.';
end;
$$;

rollback;
