-- ============================================================
-- onmangekoi — limitation de débit sur « Rejoindre »
-- ============================================================
-- Un code d'invitation fait 6 symboles Crockford, soit ~1,07 milliard de
-- combinaisons : largement assez tant qu'on ne peut pas les essayer en
-- boucle. Sans limite, un script atteint statistiquement une session
-- « waiting » en quelques centaines de milliers d'essais.
--
-- Principe : chaque essai qui ne tombe sur aucune session est journalisé
-- dans `public.join_attempts` ; au-delà de 10 essais ratés en 10 minutes,
-- `join_session` refuse tout net avec `omk:too_many_attempts`.
--
-- Pourquoi un essai raté renvoie NULL au lieu de lever `session_not_found` :
-- PostgREST exécute chaque RPC dans une transaction, et une exception
-- l'annule — elle emporterait avec elle l'insertion qu'on vient de faire, et
-- le compteur resterait éternellement à zéro. Le cas « code inconnu » sort
-- donc par la valeur de retour, et c'est la couche d'accès aux données qui le
-- retraduit en `omk:session_not_found` (`src/data-access/sessions.ts`).
-- Les autres refus (session lancée, session close) restent des exceptions :
-- ils prouvent que le code était bon, ils ne comptent pas comme des essais.
--
-- Ce garde-fou est par utilisateur. Il ne tient que parce que créer des
-- utilisateurs coûte quelque chose : c'est le rôle du captcha Turnstile posé
-- sur le formulaire de pseudo (`setupProfileAction`), en plus de la limite
-- d'inscriptions anonymes par IP de Supabase (`auth.rate_limit`).
-- ============================================================

-- ─── JOURNAL DES ESSAIS RATÉS ────────────────────────────────
create table if not exists public.join_attempts (
  id           bigint      generated always as identity primary key,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

alter table public.join_attempts enable row level security;

-- Aucune policy, aucun grant : la table n'existe que pour `join_session`
-- (security definer) et l'entretien nocturne. L'app ne la lit jamais.
revoke all on public.join_attempts from public, anon, authenticated;

create index if not exists idx_join_attempts_user_attempted_at
  on public.join_attempts (user_id, attempted_at desc);

comment on table public.join_attempts is
  'Essais de « Rejoindre » tombés sur aucune session, pour la limitation de débit. Purgés chaque nuit.';

-- ─── JOIN : mêmes règles, plus le compteur d'essais ──────────
create or replace function public.join_session(p_identifier text)
  returns public.sessions
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  -- 10 essais ratés en 10 minutes : une faute de frappe ou deux passent
  -- inaperçues, un balayage s'arrête au bout de 10 codes.
  c_window constant interval := interval '10 minutes';
  c_limit  constant integer  := 10;
  v_uid uuid := (select auth.uid());
  v_raw text := upper(regexp_replace(btrim(coalesce(p_identifier, '')), '[\s\-_.]+', '', 'g'));
  v_code text := public.normalize_crockford(v_raw);
  v_session public.sessions;
  v_failures integer;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and pseudo is not null) then
    perform public.raise_omk('profile_incomplete');
  end if;

  select count(*) into v_failures
  from public.join_attempts
  where user_id = v_uid
    and attempted_at > now() - c_window;

  if v_failures >= c_limit then
    perform public.raise_omk('too_many_attempts');
  end if;

  if lower(v_raw) ~ '^[a-f0-9]{32}$' then
    select * into v_session from public.sessions where invite_token = lower(v_raw);
  elsif v_raw ~ '^[A-Z0-9]{6}$' then
    -- Saisie brute d'abord (anciens codes), puis forme Crockford normalisée.
    select * into v_session from public.sessions where invite_code = v_raw;
    if v_session.id is null and v_code <> v_raw then
      select * into v_session from public.sessions where invite_code = v_code;
    end if;
  end if;

  -- Format invalide ou code inconnu : dans les deux cas l'appelant a essayé
  -- quelque chose qui n'existe pas. On le compte, et on renvoie NULL plutôt
  -- que de lever — voir l'en-tête de la migration.
  if v_session.id is null then
    insert into public.join_attempts (user_id) values (v_uid);
    return null;
  end if;

  -- Un code juste efface l'ardoise : les essais ratés d'avant ne pèsent plus
  -- sur les suivants.
  delete from public.join_attempts where user_id = v_uid;

  if exists (
    select 1 from public.session_participants
    where session_id = v_session.id and profile_id = v_uid
  ) then
    return v_session;
  end if;

  if v_session.status = 'voting' then
    perform public.raise_omk('session_started');
  end if;
  if v_session.status = 'closed' then
    perform public.raise_omk('session_closed');
  end if;

  insert into public.session_participants (session_id, profile_id)
  values (v_session.id, v_uid)
  on conflict (session_id, profile_id) do nothing;

  return v_session;
end;
$$;

-- ─── PURGE (branchée sur le job nocturne existant) ────────────
create or replace function public.purge_join_attempts(
  p_older_than interval default interval '1 day'
)
  returns integer
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_purged  integer := 0;
begin
  -- Purger à l'intérieur de la fenêtre de comptage reviendrait à désactiver
  -- la limite : on refuse.
  if p_older_than is null or p_older_than < interval '1 hour' then
    raise exception 'omk_maintenance: rétention des essais trop courte (%)', p_older_than;
  end if;

  with deleted as (
    delete from public.join_attempts
    where attempted_at < now() - p_older_than
    returning 1
  )
  select count(*)::integer into v_purged from deleted;

  insert into public.maintenance_runs (task, duration_ms, purged)
  values (
    'purge_join_attempts',
    (extract(epoch from clock_timestamp() - v_started) * 1000)::integer,
    jsonb_build_object('join_attempts', v_purged, 'older_than', p_older_than::text)
  );

  raise log 'omk_maintenance purge_join_attempts: attempts=% older_than=%', v_purged, p_older_than;

  return v_purged;
end;
$$;

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
  v_attempts integer;
begin
  select * into v_sessions from public.purge_stale_sessions();
  v_users := public.purge_inactive_anonymous();
  v_attempts := public.purge_join_attempts();

  -- Le journal est borné lui aussi : un an de passages suffit largement
  -- à diagnostiquer une purge qui dérape.
  delete from public.maintenance_runs where ran_at < now() - interval '365 days';

  return jsonb_build_object(
    'waiting_sessions', v_sessions.waiting_purged,
    'closed_sessions', v_sessions.closed_purged,
    'anonymous_users', v_users,
    'join_attempts', v_attempts
  );
end;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
revoke execute on function public.join_session(text) from public, anon;
grant execute on function public.join_session(text) to authenticated;
revoke execute on function public.purge_join_attempts(interval) from public, anon, authenticated;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
