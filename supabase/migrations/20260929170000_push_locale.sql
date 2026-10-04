-- ============================================================
-- onmangekoi — notifications push dans la langue de l'abonné
-- ============================================================
-- Issue #14. L'interface parle français et anglais ; les notifications
-- partent du serveur, déclenchées par la base, sans navigateur ni requête
-- pour dire dans quelle langue écrire. On retient donc la langue au moment
-- de l'abonnement — celle de l'interface affichée quand la personne a
-- cliqué « Me prévenir » —, et la route d'envoi écrit à chacun dans la
-- sienne.
--
-- Principes :
--   * Une colonne `locale` sur `push_subscriptions`, `fr` par défaut : les
--     abonnements d'avant cette migration étaient tous pris sur une
--     interface française. La contrainte n'admet que les langues servies.
--   * La langue appartient à l'abonnement, pas au profil : c'est celle du
--     navigateur qui reçoit la notification. Deux appareils d'une même
--     personne peuvent parler deux langues.
--   * `save_push_subscription` reçoit la langue en dernier paramètre, avec
--     `fr` par défaut : un appel à trois arguments (un déploiement de l'app
--     en retard sur la base) garde le comportement d'avant. La RPC est
--     rappelée silencieusement à chaque passage par « Me prévenir » : un
--     changement de langue suit donc au prochain passage.
--   * L'ancienne signature à trois arguments disparaît : garder les deux
--     rendrait l'appel à trois arguments ambigu pour Postgres.
--   * L'export RGPD dit la langue de chaque abonnement.
-- ============================================================

-- ─── COLONNE ─────────────────────────────────────────────────
alter table public.push_subscriptions
  add column locale text not null default 'fr'
    constraint push_subscriptions_locale_check
    check (locale in ('fr', 'en'));

comment on column public.push_subscriptions.locale is
  'Langue des notifications de cet abonnement : celle de l''interface au moment de l''abonnement (issue #14).';

-- ─── RPC D'ABONNEMENT ────────────────────────────────────────
-- Corps repris de `20260929140000_push_notifications.sql`, avec la langue en
-- plus : validée, écrite à l'insertion, rafraîchie à chaque rappel.
drop function public.save_push_subscription(text, text, text);

create function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_locale text default 'fr'
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
     or p_auth !~ '^[A-Za-z0-9_-]+=*$'
     or p_locale is null or p_locale not in ('fr', 'en') then
    perform public.raise_omk('invalid_push_subscription');
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, locale)
  values (v_uid, p_endpoint, p_p256dh, p_auth, p_locale)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        -- La langue suit l'interface : un rappel après un changement de
        -- langue la met à jour.
        locale = excluded.locale,
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

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ─── EXPORT RGPD ─────────────────────────────────────────────
-- Corps repris tel quel de `20260929150000_profile_constraints.sql`, avec la
-- langue de chaque abonnement aux notifications en plus.
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

    -- Ce que la personne a déclaré ne pas pouvoir manger (#60). Toujours
    -- présent, vide quand rien n'est déclaré : l'absence se lit aussi.
    'food_constraints', jsonb_build_object(
      'tags', coalesce((
        select jsonb_agg(pc.tag order by pc.tag)
        from public.profile_constraints pc
        where pc.profile_id = v_uid
      ), '[]'::jsonb),
      'max_price_level', (
        select pb.max_price_level
        from public.profile_budgets pb
        where pb.profile_id = v_uid
      )
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
          'locale', ps.locale,
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

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
