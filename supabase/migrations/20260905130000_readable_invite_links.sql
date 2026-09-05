-- ============================================================
-- onmangekoi — liens d'invitation lisibles
-- ============================================================
--   Le lien d'invitation passe de `/join/<token 32 hex>` à
--   `/join/dej-du-lundi-7K3M9P` : c'est le code court qui identifie la
--   session, comme à l'oral et dans le QR code.
--
--   Conséquence sur `session_preview` : le robot qui déplie le lien dans une
--   conversation (WhatsApp, Slack, iMessage…) n'est pas authentifié. Sans lui
--   ouvrir le code court, tout lien partagé perdrait son aperçu (nom de la
--   session, host, image Open Graph).
--
--   Ce que ça ouvre, et pourquoi c'est acceptable :
--     * le code court est déjà le sésame pour rejoindre — il se dit à voix
--       haute et s'affiche en QR : un lien qui le porte n'est pas moins secret
--       que le code lui-même ;
--     * l'aperçu ne rend qu'un nom, un pseudo de host et deux compteurs ;
--     * il n'est ouvert que tant que la session est en attente, c'est-à-dire
--       la seule fenêtre où rejoindre a du sens ;
--     * rejoindre reste réservé aux comptes (`join_session` exige `auth.uid()`)
--       et l'énumération coûte ~10⁹ requêtes pour un nom de session.
--   Le token long (32 hex) garde son aperçu quel que soit le statut : les
--   liens déjà partagés continuent de se déplier comme avant.
-- ============================================================

create or replace function public.session_preview(p_identifier text)
  returns table (
    id uuid,
    name text,
    status public.session_status,
    host_pseudo text,
    participant_count int,
    restaurant_count int
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with ident as (
    select
      btrim(coalesce(p_identifier, '')) as raw,
      upper(regexp_replace(btrim(coalesce(p_identifier, '')), '[\s\-_.]+', '', 'g')) as compact
  )
  select
    s.id,
    s.name,
    s.status,
    p.pseudo,
    (select count(*)::int from public.session_participants sp where sp.session_id = s.id),
    (select count(*)::int from public.session_restaurants sr where sr.session_id = s.id)
  from ident, public.sessions s
  join public.profiles p on p.id = s.host_id
  where (
      lower(ident.raw) ~ '^[a-f0-9]{32}$'
      and s.invite_token = lower(ident.raw)
    )
    or (
      ident.compact ~ '^[A-Z0-9]{6}$'
      and s.invite_code in (ident.compact, public.normalize_crockford(ident.compact))
      -- Connecté : n'importe quel statut (la page d'erreur nomme la session).
      -- Anonyme : uniquement une session encore ouverte aux arrivées.
      and ((select auth.uid()) is not null or s.status = 'waiting')
    );
$$;

revoke execute on function public.session_preview(text) from public;
grant execute on function public.session_preview(text) to anon, authenticated;
