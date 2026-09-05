-- ============================================================
-- onmangekoi — purge des anonymes inactifs et des sessions périmées
-- ============================================================
-- Chaque pseudo choisi crée un utilisateur anonyme Supabase : sans purge,
-- `auth.users` et `public.sessions` grossissent indéfiniment. La requête
-- manuelle documentée dans `docs/local-stack.md` devient ici une fonction
-- `security definer` planifiée chaque nuit par `pg_cron`.
--
-- Principes :
--   * Un utilisateur qui a lié une adresse (même non confirmée), un
--     téléphone ou une identité externe n'est JAMAIS purgé : seul un
--     anonyme sans aucun moyen de reconnexion est effaçable.
--   * L'inactivité se mesure sur le compte lui-même (création, dernière
--     connexion) ET sur son activité métier (sessions hébergées,
--     participations). Une session non clôturée protège ses membres quelle
--     que soit son ancienneté.
--   * Les suppressions descendent par les clés étrangères existantes :
--     `auth.users` → `profiles` → `lists` / `sessions` → le reste.
--   * Chaque passage journalise le nombre de lignes purgées dans
--     `public.maintenance_runs` (et dans les logs Postgres).
-- ============================================================

-- ─── JOURNAL DES PASSAGES D'ENTRETIEN ────────────────────────
create table if not exists public.maintenance_runs (
  id          bigint      generated always as identity primary key,
  task        text        not null,
  ran_at      timestamptz not null default now(),
  duration_ms integer     not null,
  purged      jsonb       not null default '{}'::jsonb
);

alter table public.maintenance_runs enable row level security;

-- Aucune policy : la table n'est lisible que par le propriétaire du schéma
-- (migrations, `service_role`), jamais par l'app.
revoke all on public.maintenance_runs from public, anon, authenticated;

create index if not exists idx_maintenance_runs_task_ran_at
  on public.maintenance_runs (task, ran_at desc);

-- ─── INDEX POUR LES BALAYAGES DE PURGE ───────────────────────
create index if not exists idx_sessions_status_created_at
  on public.sessions (status, created_at);
create index if not exists idx_sessions_closed_at
  on public.sessions (closed_at)
  where status = 'closed';

-- ─── SESSIONS PÉRIMÉES ───────────────────────────────────────
-- `waiting` jamais lancée : abandonnée par son host, personne ne la
-- rejoindra plus. `closed` : purgée passé le délai de rétention. Passer
-- `null` conserve la catégorie (utile le jour où l'historique arrive).
create or replace function public.purge_stale_sessions(
  p_waiting_older_than interval default interval '7 days',
  p_closed_older_than  interval default interval '180 days'
)
  returns table (waiting_purged integer, closed_purged integer)
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_waiting integer := 0;
  v_closed  integer := 0;
begin
  if p_waiting_older_than is not null and p_waiting_older_than < interval '1 day' then
    raise exception 'omk_maintenance: rétention « waiting » trop courte (%)', p_waiting_older_than;
  end if;
  if p_closed_older_than is not null and p_closed_older_than < interval '1 day' then
    raise exception 'omk_maintenance: rétention « closed » trop courte (%)', p_closed_older_than;
  end if;

  if p_waiting_older_than is not null then
    with deleted as (
      delete from public.sessions s
      where s.status = 'waiting'
        and s.launched_at is null
        and s.created_at < now() - p_waiting_older_than
      returning 1
    )
    select count(*)::integer into v_waiting from deleted;
  end if;

  if p_closed_older_than is not null then
    with deleted as (
      delete from public.sessions s
      where s.status = 'closed'
        and coalesce(s.closed_at, s.created_at) < now() - p_closed_older_than
      returning 1
    )
    select count(*)::integer into v_closed from deleted;
  end if;

  insert into public.maintenance_runs (task, duration_ms, purged)
  values (
    'purge_stale_sessions',
    (extract(epoch from clock_timestamp() - v_started) * 1000)::integer,
    jsonb_build_object('waiting_sessions', v_waiting, 'closed_sessions', v_closed)
  );

  raise log 'omk_maintenance purge_stale_sessions: waiting=% closed=%', v_waiting, v_closed;

  waiting_purged := v_waiting;
  closed_purged := v_closed;
  return next;
end;
$$;

-- ─── UTILISATEURS ANONYMES INACTIFS ──────────────────────────
create or replace function public.purge_inactive_anonymous(
  p_older_than interval default interval '90 days'
)
  returns integer
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_cutoff  timestamptz;
  v_purged  integer := 0;
begin
  if p_older_than is null or p_older_than < interval '1 day' then
    raise exception 'omk_maintenance: rétention anonyme trop courte (%)', p_older_than;
  end if;

  v_cutoff := now() - p_older_than;

  with purgeable as (
    select u.id
    from auth.users u
    where u.is_anonymous is true
      -- Un moyen de reconnexion, même en attente de confirmation, protège
      -- définitivement le compte : tant que l'email n'est pas validé,
      -- Supabase laisse `is_anonymous` à true.
      and u.email is null
      and coalesce(u.email_change, '') = ''
      and u.phone is null
      and coalesce(u.phone_change, '') = ''
      and not exists (
        select 1
        from auth.identities i
        where i.user_id = u.id
          and i.provider <> 'anonymous'
      )
      -- Compte dormant : ni créé ni utilisé récemment.
      and u.created_at < v_cutoff
      and coalesce(u.last_sign_in_at, u.created_at) < v_cutoff
      -- Aucune session hébergée récente, aucune session en cours.
      and not exists (
        select 1
        from public.sessions s
        where s.host_id = u.id
          and (
            s.status <> 'closed'
            or greatest(
                 s.created_at,
                 coalesce(s.launched_at, s.created_at),
                 coalesce(s.closed_at, s.created_at)
               ) >= v_cutoff
          )
      )
      -- Aucune participation récente, aucune participation en cours.
      and not exists (
        select 1
        from public.session_participants sp
        join public.sessions s on s.id = sp.session_id
        where sp.profile_id = u.id
          and (
            s.status <> 'closed'
            or sp.joined_at >= v_cutoff
            or coalesce(s.closed_at, s.created_at) >= v_cutoff
          )
      )
  ),
  deleted as (
    delete from auth.users u
    using purgeable p
    where u.id = p.id
    returning 1
  )
  select count(*)::integer into v_purged from deleted;

  insert into public.maintenance_runs (task, duration_ms, purged)
  values (
    'purge_inactive_anonymous',
    (extract(epoch from clock_timestamp() - v_started) * 1000)::integer,
    jsonb_build_object('anonymous_users', v_purged, 'older_than', p_older_than::text)
  );

  raise log 'omk_maintenance purge_inactive_anonymous: users=% older_than=%', v_purged, p_older_than;

  return v_purged;
end;
$$;

-- ─── ORCHESTRATION (cible du job nocturne) ───────────────────
-- Les sessions périmées passent en premier : leurs participants cessent
-- alors de protéger des comptes qui n'ont plus aucune activité.
create or replace function public.run_maintenance()
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_sessions record;
  v_users    integer;
begin
  select * into v_sessions from public.purge_stale_sessions();
  v_users := public.purge_inactive_anonymous();

  -- Le journal est borné lui aussi : un an de passages suffit largement
  -- à diagnostiquer une purge qui dérape.
  delete from public.maintenance_runs where ran_at < now() - interval '365 days';

  return jsonb_build_object(
    'waiting_sessions', v_sessions.waiting_purged,
    'closed_sessions', v_sessions.closed_purged,
    'anonymous_users', v_users
  );
end;
$$;

-- ─── PLANIFICATION NOCTURNE (pg_cron) ────────────────────────
-- `pg_cron` n'existe ni sur un PostgreSQL nu ni sur certains plans : son
-- absence ne doit pas faire échouer la migration. Le cas échéant,
-- `public.run_maintenance()` reste appelable à la main.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'omk_maintenance: pg_cron indisponible — planifier public.run_maintenance() autrement';
    return;
  end if;

  execute 'create extension if not exists pg_cron';
  -- Avant pg_cron 1.5, replanifier un même nom lève une erreur.
  execute $cron$ delete from cron.job where jobname = 'omk-nightly-maintenance' $cron$;
  execute $cron$ select cron.schedule(
    'omk-nightly-maintenance',
    '17 3 * * *',
    'select public.run_maintenance()'
  ) $cron$;
exception
  -- Extension présente mais non chargeable (shared_preload_libraries, droits,
  -- plan) : la migration doit passer quand même, l'exploitant est averti.
  when others then
    raise warning 'omk_maintenance: pg_cron non activable ici (%) — planifier public.run_maintenance() à la main', sqlerrm;
end;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
-- L'entretien n'est jamais déclenché depuis l'app : ni `anon` ni
-- `authenticated` ne peuvent exécuter ces fonctions.
revoke execute on function public.purge_stale_sessions(interval, interval) from public, anon, authenticated;
revoke execute on function public.purge_inactive_anonymous(interval) from public, anon, authenticated;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
