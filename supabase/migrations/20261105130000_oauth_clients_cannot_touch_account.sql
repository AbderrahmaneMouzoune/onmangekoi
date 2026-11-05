-- ============================================================
-- onmangekoi — les apps connectées (MCP) ne touchent pas au compte
-- ============================================================
-- Depuis l'ouverture du serveur MCP (/api/mcp), Claude, ChatGPT ou Cursor
-- appellent la base avec le jeton OAuth de l'utilisateur : un JWT ordinaire,
-- qui porte en plus le claim `client_id`. La RLS et les RPC s'appliquent donc
-- telles quelles, et c'est voulu — un agent ne peut rien de plus que
-- l'utilisateur.
--
-- Quelques gestes doivent pourtant rester à la personne, dans l'app :
--   * `delete_my_account()` — irréversible, il efface tout ;
--   * `export_my_data()`    — il sortirait d'un coup toutes ses données vers
--                             un service tiers ;
--   * les jetons personnels (`api_tokens`) — une app connectée ne doit ni en
--     créer (refusé dans `create_api_token` même), ni les lire, ni les
--     révoquer : ils sont l'autre porte d'entrée du MCP.
--
-- Plutôt que de recopier leur corps (et de risquer de le désynchroniser), on
-- renomme chaque fonction en `*_unguarded`, on la retire des rôles de l'API,
-- et on remet sous son nom public une enveloppe qui refuse tout appel portant
-- un `client_id`, puis délègue. Le contrat vu par l'app ne change pas.
--
-- ⚠️ Une migration future qui ferait `create or replace` sur l'une de ces
-- deux fonctions écraserait l'enveloppe : modifier `*_unguarded` à la place.
-- ============================================================

-- Vrai quand la requête vient d'un client OAuth (jeton d'une app connectée).
create or replace function public.is_oauth_client_request()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'client_id', '') <> ''
$$;

comment on function public.is_oauth_client_request() is
  'Vrai quand le JWT de la requête porte un client_id : appel d''une app connectée (serveur OAuth Supabase, MCP).';

revoke execute on function public.is_oauth_client_request() from public, anon;
grant execute on function public.is_oauth_client_request() to authenticated;

-- ─── delete_my_account ───────────────────────────────────────

alter function public.delete_my_account() rename to delete_my_account_unguarded;
revoke execute on function public.delete_my_account_unguarded() from public, anon, authenticated;

create function public.delete_my_account()
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
begin
  if public.is_oauth_client_request() then
    raise exception 'omk:forbidden_for_connected_apps';
  end if;
  perform public.delete_my_account_unguarded();
end;
$$;

comment on function public.delete_my_account() is
  'Supprime le compte de l''appelant (voir delete_my_account_unguarded). Refusé aux apps connectées.';

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ─── export_my_data ──────────────────────────────────────────

alter function public.export_my_data() rename to export_my_data_unguarded;
revoke execute on function public.export_my_data_unguarded() from public, anon, authenticated;

create function public.export_my_data()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if public.is_oauth_client_request() then
    raise exception 'omk:forbidden_for_connected_apps';
  end if;
  return public.export_my_data_unguarded();
end;
$$;

comment on function public.export_my_data() is
  'Export RGPD des données de l''appelant (voir export_my_data_unguarded). Refusé aux apps connectées.';

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- ─── api_tokens : hors de portée des apps connectées ─────────
-- Politique restrictive : elle s'ajoute (AND) aux politiques « les siens ».
create policy api_tokens_not_for_connected_apps
  on public.api_tokens
  as restrictive
  for all
  to authenticated
  using (not public.is_oauth_client_request());
