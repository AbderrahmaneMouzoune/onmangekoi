-- ============================================================
-- onmangekoi — notifications push : lancement du vote, clôture
-- ============================================================
-- Issue #7. Le Realtime ne sert que la page ouverte : un invité qui a fermé
-- l'onglet n'apprend ni que le vote est lancé, ni que le classement est prêt.
-- Le service worker (#11) est là ; il reste à lui envoyer quelque chose.
--
-- Principes :
--   * Un abonnement Web Push est celui d'un **navigateur**, pas d'une
--     session : `push_subscriptions` le rattache à un utilisateur, qui est
--     prévenu pour toutes les sessions auxquelles il participe. L'endpoint
--     est unique — un navigateur n'a qu'un abonnement par clé VAPID. Si
--     quelqu'un d'autre s'abonne sur le même appareil, l'abonnement change
--     de main : c'est lui qui tient le navigateur désormais.
--   * L'écriture passe par `save_push_subscription`, jamais par un `insert`
--     direct : la reprise d'un endpoint appartenant à un autre compte, que
--     la RLS interdirait à raison, se fait ici en connaissance de cause, et
--     le nombre d'appareils par compte est plafonné (10) — une boucle côté
--     client ne peut pas faire exploser le coût d'un envoi.
--   * L'envoi n'a pas lieu en base. Le chiffrement Web Push (aes128gcm) et
--     la signature VAPID vivent côté Node, dans `/api/push/dispatch`. La
--     base se contente de prévenir cette route, par `pg_net`, quand
--     `sessions.status` passe à `voting` ou à `closed`. L'appel part après
--     le commit — une transaction annulée ne prévient personne — et ne
--     peut jamais faire échouer le changement de statut : toute erreur est
--     ravalée en avertissement.
--   * Ni l'URL ni le secret partagé ne sont figés ici : ils viennent du
--     Vault de Supabase (`push_dispatch_url`, `push_dispatch_secret`). Sans
--     eux — en local, en CI, sur une preview —, le trigger ne fait rien.
--   * On ne prévient pas l'auteur du changement (`auth.uid()`) : le host qui
--     lance, le dernier votant dont le bulletin clôt la session, le host qui
--     clôture. La clôture à l'échéance (`close_expired_sessions`, pg_cron)
--     n'a pas d'auteur : tout le monde est prévenu.
--   * Seules les **mises à jour** de statut comptent. Une session ouverte
--     naît en `voting` : à sa création, personne d'autre que le host n'y
--     participe, il n'y a personne à prévenir. Un second tour naît lui aussi
--     en `voting`, ses participants recopiés dans la même transaction ; il
--     n'est pas annoncé pour l'instant — le trigger ne voit que des `update`.
--   * Le corps de l'appel ne porte que des identifiants : la session, le
--     nouveau statut, l'auteur. La route relit le reste avec la clé secrète.
--   * Pas d'appel quand aucun destinataire n'a d'abonnement : c'est le cas
--     général, et il ne coûte qu'une jointure indexée.
--   * Suppression du compte et purge des anonymes : l'abonnement suit
--     `auth.users` en cascade. L'export RGPD le liste.
-- ============================================================

-- ─── EXTENSION ───────────────────────────────────────────────
-- Même prudence que pg_cron : l'absence de `pg_net` prive l'installation des
-- notifications, elle ne fait pas échouer la migration.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'omk: pg_net indisponible — pas de notifications push';
    return;
  end if;
  execute 'create extension if not exists pg_net with schema extensions';
exception
  when others then
    raise warning 'omk: pg_net non activable ici (%) — pas de notifications push', sqlerrm;
end;
$$;

-- ─── TABLE ───────────────────────────────────────────────────
create table public.push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  -- Adresse du service push du navigateur (FCM, Mozilla, Apple…). Toujours
  -- en HTTPS : c'est la route qui l'appelle, jamais un navigateur.
  endpoint   text        not null unique
    constraint push_subscriptions_endpoint_check
    check (char_length(endpoint) <= 2048 and endpoint ~ '^https://'),
  -- Clés de chiffrement du navigateur (base64url), transmises telles quelles
  -- par `PushSubscription.toJSON()`.
  p256dh     text        not null
    constraint push_subscriptions_p256dh_check
    check (char_length(p256dh) between 1 and 256 and p256dh ~ '^[A-Za-z0-9_-]+=*$'),
  auth       text        not null
    constraint push_subscriptions_auth_check
    check (char_length(auth) between 1 and 64 and auth ~ '^[A-Za-z0-9_-]+=*$'),
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'Abonnements Web Push, un par navigateur. Écrits par save_push_subscription, lus par '
  '/api/push/dispatch (clé secrète), purgés quand le service push répond 404 ou 410.';

alter table public.push_subscriptions enable row level security;

-- Lecture et désabonnement : ses propres appareils, rien d'autre. L'écriture
-- passe par la RPC ci-dessous.
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ─── ABONNEMENT ──────────────────────────────────────────────
-- Enregistre (ou rafraîchit) l'abonnement du navigateur courant. Idempotent :
-- l'app le rappelle à chaque passage en salle d'attente, ce qui recolle un
-- abonnement que le navigateur a gardé mais que la base a perdu (compte
-- supprimé puis recréé, appareil passé d'une personne à l'autre).
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  c_max_devices constant integer := 10;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if p_endpoint is null or char_length(p_endpoint) > 2048 or p_endpoint !~ '^https://'
     or p_p256dh is null or char_length(p_p256dh) not between 1 and 256
     or p_p256dh !~ '^[A-Za-z0-9_-]+=*$'
     or p_auth is null or char_length(p_auth) not between 1 and 64
     or p_auth !~ '^[A-Za-z0-9_-]+=*$' then
    perform public.raise_omk('invalid_push_subscription');
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        -- Changement de main : l'abonnement repart de zéro. Simple
        -- rafraîchissement : la date d'origine reste.
        created_at = case
          when public.push_subscriptions.user_id = excluded.user_id
            then public.push_subscriptions.created_at
          else now()
        end;

  -- Au-delà de 10 appareils, les plus anciens cèdent la place.
  delete from public.push_subscriptions ps
  where ps.user_id = v_uid
    and ps.id not in (
      select keep.id
      from public.push_subscriptions keep
      where keep.user_id = v_uid
      order by keep.created_at desc, keep.id
      limit c_max_devices
    );
end;
$$;

-- ─── APPEL DE LA ROUTE D'ENVOI ───────────────────────────────
create or replace function public.notify_session_status_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_url text;
  v_secret text;
begin
  -- Sans pg_net, rien pour appeler : l'installation s'en passe.
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    return null;
  end if;

  -- Personne à prévenir : le cas général, réglé sans lire le Vault.
  if not exists (
    select 1
    from public.session_participants sp
    join public.push_subscriptions ps on ps.user_id = sp.profile_id
    where sp.session_id = new.id
      and sp.profile_id is distinct from v_actor
  ) then
    return null;
  end if;

  select ds.decrypted_secret into v_url
  from vault.decrypted_secrets ds
  where ds.name = 'push_dispatch_url';

  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds
  where ds.name = 'push_dispatch_secret';

  if coalesce(btrim(v_url), '') = '' or coalesce(btrim(v_secret), '') = '' then
    return null;
  end if;

  perform net.http_post(
    url := btrim(v_url),
    body := jsonb_build_object(
      'session_id', new.id,
      'status', new.status,
      'actor_id', v_actor
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || btrim(v_secret)
    ),
    timeout_milliseconds := 5000
  );

  return null;
exception
  -- Une notification manquée ne doit jamais empêcher un lancement ou une
  -- clôture : on le signale dans les journaux, et on laisse passer.
  when others then
    raise warning 'omk: notification push non envoyée pour la session % (%)', new.id, sqlerrm;
    return null;
end;
$$;

create trigger sessions_notify_status_change
  after update of status on public.sessions
  for each row
  when (old.status is distinct from new.status and new.status in ('voting', 'closed'))
  execute function public.notify_session_status_change();

-- ─── EXPORT RGPD ─────────────────────────────────────────────
-- Toute ligne rattachée à `auth.uid()` doit se retrouver dans l'export. Le
-- corps est repris tel quel de `20260923110000_session_rules.sql`, avec les
-- abonnements push en plus.
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

    -- Restos ajoutés à la base par cette personne. La ligne reste en base
    -- après suppression du compte — `created_by` est simplement détaché — mais
    -- tant que le compte existe, le lien est une donnée la concernant.
    'contributed_restaurants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'cuisine_type', r.cuisine_type,
          'address', r.address,
          'city', r.city,
          'price_level', r.price_level,
          'source', r.source,
          'created_at', r.created_at
        )
        order by r.created_at
      )
      from public.restaurants r
      where r.created_by = v_uid
    ), '[]'::jsonb),

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

    'groups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'is_owner', g.owner_id = v_uid,
          'joined_at', gm.added_at,
          'member_count',
            (select count(*) from public.group_members m where m.group_id = g.id)
        )
        order by gm.added_at
      )
      from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where gm.profile_id = v_uid
    ), '[]'::jsonb),

    'pending_invitations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'session_id', s.id,
          'session_name', s.name,
          'invited_at', si.invited_at
        )
        order by si.invited_at
      )
      from public.session_invitations si
      join public.sessions s on s.id = si.session_id
      where si.profile_id = v_uid
    ), '[]'::jsonb),

    -- Les navigateurs abonnés aux notifications. Les clés de chiffrement
    -- restent en base : ce sont des clés techniques, pas une donnée sur la
    -- personne, et un fichier d'export n'a pas à les promener.
    'push_subscriptions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'endpoint', ps.endpoint,
          'created_at', ps.created_at
        )
        order by ps.created_at
      )
      from public.push_subscriptions ps
      where ps.user_id = v_uid
    ), '[]'::jsonb),

    'hosted_sessions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'status', s.status,
          'invite_code', s.invite_code,
          'rules', s.rules,
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
          -- Les restos que cette personne a apportés à cette session-là.
          'restaurants_added', coalesce((
            select jsonb_agg(
              jsonb_build_object('name', r.name, 'added_at', sr.added_at)
              order by sr.added_at
            )
            from public.session_restaurants sr
            join public.restaurants r on r.id = sr.restaurant_id
            where sr.session_id = s.id
              and sr.added_by = v_uid
          ), '[]'::jsonb),
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
-- `notify_session_status_change` n'est qu'un trigger : personne ne l'appelle.
-- `save_push_subscription` est réservée aux utilisateurs connectés, anonymes
-- Supabase compris — un invité sans compte doit pouvoir être prévenu.
revoke execute on function public.notify_session_status_change() from public, anon, authenticated;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
