-- ============================================================
-- onmangekoi — vote chronométré (clôture à une heure limite)
-- ============================================================
-- Une session restait ouverte tant que tout le monde n'avait pas voté ou que
-- le host ne clôturait pas : un seul votant absent gelait le déjeuner. Le host
-- peut désormais poser une échéance à la création — « clôturer à 12:00 » ou
-- « dans 10 min » — et la base s'en charge.
--
-- Principes :
--   * `sessions.closes_at` est un instant absolu, optionnel. Il ne change
--     rien aux sessions qui n'en portent pas : tout le reste est identique.
--   * La clôture par échéance emprunte exactement le chemin de la clôture
--     manuelle — `status = 'closed'`, `closed_at = now()` — donc les mêmes
--     événements Realtime, le même classement, les mêmes votes manquants à 0.
--   * Un job `pg_cron` à la minute balaye les sessions `voting` échues. Une
--     session `waiting` n'est jamais clôturée par l'échéance : sans un seul
--     vote, le classement n'aurait aucun sens — `launch_session` refuse de la
--     lancer et le host prolonge.
--   * Le host peut prolonger (`extend_session`, 5 min par défaut) tant que la
--     session n'est pas close, y compris juste après l'échéance : c'est ce qui
--     rattrape une salle d'attente qui a traîné.
-- ============================================================

-- ─── COLONNE ─────────────────────────────────────────────────
alter table public.sessions
  add column if not exists closes_at timestamptz;

comment on column public.sessions.closes_at is
  'Échéance de clôture automatique (instant absolu). NULL = session sans limite de temps.';

-- Balayage à la minute : seules les sessions en cours et datées comptent.
create index if not exists idx_sessions_closes_at_voting
  on public.sessions (closes_at)
  where status = 'voting' and closes_at is not null;

-- ─── GARDE-FOU D'ÉCHÉANCE ────────────────────────────────────
-- Une échéance déjà passée clôturerait la session avant le premier vote ;
-- une échéance à trois semaines n'est plus un chronomètre. Les deux bornes
-- sont vérifiées en base, quel que soit le chemin d'entrée.
create or replace function public.assert_valid_deadline(p_closes_at timestamptz)
  returns void
  language plpgsql
  volatile
  set search_path = ''
as $$
begin
  if p_closes_at is null then
    return;
  end if;
  if p_closes_at <= now() + interval '1 minute' then
    perform public.raise_omk('deadline_too_soon');
  end if;
  if p_closes_at > now() + interval '12 hours' then
    perform public.raise_omk('deadline_too_far');
  end if;
end;
$$;

-- ─── CRÉATION AVEC ÉCHÉANCE ──────────────────────────────────
-- La signature change (troisième paramètre) : on remplace la fonction plutôt
-- que de créer une surcharge, que PostgREST ne saurait pas départager.
drop function if exists public.create_session(text, uuid[]);

create function public.create_session(
  p_name text,
  p_restaurant_ids uuid[],
  p_closes_at timestamptz default null
)
  returns public.sessions
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(p_name);
  v_ids uuid[];
  v_session public.sessions;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and pseudo is not null) then
    perform public.raise_omk('profile_incomplete');
  end if;
  if v_name is null or char_length(v_name) not between 1 and 100 then
    perform public.raise_omk('invalid_name');
  end if;
  perform public.assert_valid_deadline(p_closes_at);

  select array_agg(x.id order by x.ord)
    into v_ids
  from (
    select distinct on (r.id) r.id, t.ord
    from unnest(coalesce(p_restaurant_ids, '{}'::uuid[])) with ordinality as t(id, ord)
    join public.restaurants r on r.id = t.id
    order by r.id, t.ord
  ) x;

  if v_ids is null or array_length(v_ids, 1) < 1 then
    perform public.raise_omk('no_restaurants');
  end if;
  if array_length(v_ids, 1) > 100 then
    perform public.raise_omk('too_many_restaurants');
  end if;

  insert into public.sessions (name, host_id, invite_code, closes_at)
  values (v_name, v_uid, public.generate_invite_code(), p_closes_at)
  returning * into v_session;

  insert into public.session_restaurants (session_id, restaurant_id, position)
  select v_session.id, t.id, (t.ord - 1)::int
  from unnest(v_ids) with ordinality as t(id, ord);

  insert into public.session_participants (session_id, profile_id)
  values (v_session.id, v_uid);

  return v_session;
end;
$$;

-- ─── LANCEMENT : ne pas démarrer un vote déjà échu ───────────
create or replace function public.launch_session(p_session_id uuid)
  returns public.sessions
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;

  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    perform public.raise_omk('session_not_found');
  end if;
  if v_session.host_id <> v_uid then
    perform public.raise_omk('host_only');
  end if;
  if v_session.status <> 'waiting' then
    perform public.raise_omk('session_already_started');
  end if;
  if (select count(*) from public.session_participants where session_id = p_session_id) < 2 then
    perform public.raise_omk('not_enough_participants');
  end if;
  if not exists (select 1 from public.session_restaurants where session_id = p_session_id) then
    perform public.raise_omk('no_restaurants');
  end if;
  -- Le job ne ferme que les sessions `voting` : lancer après l'échéance
  -- produirait une session que plus rien ne clôture. Le host prolonge d'abord.
  if v_session.closes_at is not null and v_session.closes_at <= now() then
    perform public.raise_omk('deadline_passed');
  end if;

  update public.sessions
    set status = 'voting', launched_at = now()
    where id = p_session_id
    returning * into v_session;

  return v_session;
end;
$$;

-- ─── PROLONGATION PAR LE HOST ────────────────────────────────
-- Repart de `now()` quand l'échéance vient de passer : entre le tick du job
-- et le clic, prolonger doit rendre du temps réel, pas cinq minutes déjà
-- consommées.
create or replace function public.extend_session(
  p_session_id uuid,
  p_minutes integer default 5
)
  returns public.sessions
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_next timestamptz;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if p_minutes is null or p_minutes not between 1 and 60 then
    perform public.raise_omk('invalid_extension');
  end if;

  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    perform public.raise_omk('session_not_found');
  end if;
  if v_session.host_id <> v_uid then
    perform public.raise_omk('host_only');
  end if;
  if v_session.status = 'closed' then
    perform public.raise_omk('session_closed');
  end if;
  if v_session.closes_at is null then
    perform public.raise_omk('no_deadline');
  end if;

  v_next := greatest(v_session.closes_at, now()) + make_interval(mins => p_minutes);
  perform public.assert_valid_deadline(v_next);

  update public.sessions
    set closes_at = v_next
    where id = p_session_id
    returning * into v_session;

  return v_session;
end;
$$;

-- ─── CLÔTURE PAR ÉCHÉANCE (cible du job à la minute) ─────────
-- Même écriture que `close_session` : c'est ce qui garantit aux clients les
-- mêmes événements Realtime qu'une clôture manuelle. Les votes manquants
-- comptent 0, règle déjà portée par `session_results`.
create or replace function public.close_expired_sessions()
  returns integer
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_closed  integer := 0;
begin
  with expired as (
    update public.sessions s
      set status = 'closed', closed_at = now()
      where s.status = 'voting'
        and s.closes_at is not null
        and s.closes_at <= now()
      returning 1
  )
  select count(*)::integer into v_closed from expired;

  -- Le job tourne 1 440 fois par jour : on ne journalise que les passages qui
  -- ont fait quelque chose, sinon le journal d'entretien devient illisible.
  if v_closed > 0 then
    insert into public.maintenance_runs (task, duration_ms, purged)
    values (
      'close_expired_sessions',
      (extract(epoch from clock_timestamp() - v_started) * 1000)::integer,
      jsonb_build_object('closed_sessions', v_closed)
    );
    raise log 'omk_maintenance close_expired_sessions: closed=%', v_closed;
  end if;

  return v_closed;
end;
$$;

-- ─── PLANIFICATION À LA MINUTE (pg_cron) ─────────────────────
-- Même prudence que l'entretien nocturne : l'absence de `pg_cron` ne doit pas
-- faire échouer la migration, seulement priver l'installation du balayage.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'omk: pg_cron indisponible — planifier public.close_expired_sessions() autrement';
    return;
  end if;

  execute 'create extension if not exists pg_cron';
  execute $cron$ delete from cron.job where jobname = 'omk-close-expired-sessions' $cron$;
  execute $cron$ select cron.schedule(
    'omk-close-expired-sessions',
    '* * * * *',
    'select public.close_expired_sessions()'
  ) $cron$;
exception
  when others then
    raise warning 'omk: pg_cron non activable ici (%) — planifier public.close_expired_sessions() à la main', sqlerrm;
end;
$$;

-- ─── EXPORT RGPD ─────────────────────────────────────────────
-- Toute colonne rattachée à `auth.uid()` doit se retrouver dans l'export :
-- `closes_at` décrit une session hébergée au même titre que `closed_at`.
create or replace function public.export_my_data()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_export jsonb;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;

  select jsonb_build_object(
    'format_version', 1,
    'exported_at', now(),

    'account', (
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'is_anonymous', u.is_anonymous,
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at
      )
      from auth.users u
      where u.id = v_uid
    ),

    'profile', (
      select jsonb_build_object(
        'pseudo', p.pseudo,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      from public.profiles p
      where p.id = v_uid
    ),

    'lists', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'name', l.name,
          'is_collaborative', l.is_collaborative,
          'share_code', l.share_code,
          'created_at', l.created_at,
          'restaurants', coalesce((
            select jsonb_agg(
              jsonb_build_object('id', r.id, 'name', r.name, 'added_at', lr.added_at)
              order by lr.added_at
            )
            from public.list_restaurants lr
            join public.restaurants r on r.id = lr.restaurant_id
            where lr.list_id = l.id
          ), '[]'::jsonb)
        )
        order by l.created_at
      )
      from public.lists l
      where l.owner_id = v_uid
    ), '[]'::jsonb),

    'hosted_sessions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'status', s.status,
          'invite_code', s.invite_code,
          'created_at', s.created_at,
          'launched_at', s.launched_at,
          'closes_at', s.closes_at,
          'closed_at', s.closed_at,
          'participant_count',
            (select count(*) from public.session_participants sp where sp.session_id = s.id)
        )
        order by s.created_at
      )
      from public.sessions s
      where s.host_id = v_uid
    ), '[]'::jsonb),

    'participations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'session_id', s.id,
          'session_name', s.name,
          'status', s.status,
          'is_host', s.host_id = v_uid,
          'joined_at', sp.joined_at,
          'has_finished_voting', sp.has_finished_voting,
          'votes', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'restaurant', r.name,
                'value', v.value,
                'label', case v.value
                  when 2 then 'coup de cœur'
                  when 1 then 'ça me va'
                  when 0 then 'bof'
                  when -2 then 'veto'
                end,
                'created_at', v.created_at
              )
              order by v.created_at
            )
            from public.votes v
            join public.session_restaurants sr on sr.id = v.session_restaurant_id
            join public.restaurants r on r.id = sr.restaurant_id
            where v.participant_id = sp.id
          ), '[]'::jsonb)
        )
        order by sp.joined_at
      )
      from public.session_participants sp
      join public.sessions s on s.id = sp.session_id
      where sp.profile_id = v_uid
    ), '[]'::jsonb)
  )
  into v_export;

  return v_export;
end;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
-- `create_session` a été supprimée puis recréée : ses droits sont à reposer.
-- Le balayage n'est jamais déclenché depuis l'app.
revoke execute on function public.assert_valid_deadline(timestamptz) from public, anon, authenticated;
revoke execute on function public.close_expired_sessions() from public, anon, authenticated;

revoke execute on function public.create_session(text, uuid[], timestamptz) from public, anon;
revoke execute on function public.extend_session(uuid, integer) from public, anon;
grant execute on function public.create_session(text, uuid[], timestamptz) to authenticated;
grant execute on function public.extend_session(uuid, integer) to authenticated;
