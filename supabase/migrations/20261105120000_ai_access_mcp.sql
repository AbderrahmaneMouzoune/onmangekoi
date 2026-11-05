-- ============================================================
-- onmangekoi — accès IA : jetons personnels et serveur MCP
-- ============================================================
-- Objectif : qu'une IA (Claude, ChatGPT, Cursor…) puisse tenir les listes
-- d'une personne à sa place. « J'ai mangé à La Ba, c'était bon » doit
-- suffire : l'IA cherche le resto dans le catalogue, l'ajoute s'il n'existe
-- pas, et le range dans la bonne liste.
--
-- L'IA parle au serveur MCP de l'app (`/api/mcp`), qui n'a ni cookie ni
-- session Supabase : il ne connaît que le jeton que la personne a collé dans
-- son client. Ce jeton ne peut pas devenir un JWT Supabase — la production
-- signe en ES256 avec une clé que l'app ne détient pas. Tout passe donc par
-- des RPC `mcp_*` qui reçoivent le jeton en premier argument, le résolvent en
-- base, et agissent au nom de son propriétaire.
--
-- Principes :
--   * Le jeton n'est jamais stocké : seule son empreinte SHA-256 l'est. Il
--     est montré une fois, à la création, et ne se relit plus.
--   * 192 bits d'aléa : pas de force brute possible, donc pas de limiteur.
--   * Un jeton se révoque d'un clic (`delete` sous RLS) et part avec le
--     compte (`on delete cascade`).
--   * Les RPC `mcp_*` sont `security definer` et ouvertes à `anon` : c'est le
--     jeton qui fait l'autorisation, et chaque fonction revérifie que la
--     liste visée appartient bien à son propriétaire. Aucune ne lit les
--     listes d'un autre.
--   * Pour réutiliser telles quelles `create_manual_restaurant` et
--     `upsert_restaurant_from_place` — et leurs validations —, la résolution
--     du jeton pose les claims du propriétaire pour la seule transaction :
--     `auth.uid()` y rend alors son id.
--   * Dix jetons au plus par personne : un par appareil ou par IA, pas plus.
-- ============================================================

-- ─── TABLE ───────────────────────────────────────────────────
create table public.api_tokens (
  id           uuid        primary key default gen_random_uuid(),
  owner_id     uuid        not null references public.profiles (id) on delete cascade,
  label        text        not null
    constraint api_tokens_label_check check (char_length(label) between 1 and 60),
  token_hash   text        not null unique,
  -- Quatre derniers caractères, pour reconnaître un jeton sans le dévoiler.
  token_hint   text        not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index api_tokens_owner_id_idx on public.api_tokens (owner_id);

comment on table public.api_tokens is
  'Jetons personnels d''accès IA (serveur MCP). Seule l''empreinte SHA-256 est stockée.';

alter table public.api_tokens enable row level security;

-- Lire et révoquer les siens. Ni insertion ni mise à jour directe : la
-- création passe par `create_api_token`, qui seule connaît le jeton en clair.
create policy api_tokens_select_own
  on public.api_tokens for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy api_tokens_delete_own
  on public.api_tokens for delete
  to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.api_tokens from public, anon, authenticated;
grant select (id, owner_id, label, token_hint, created_at, last_used_at)
  on public.api_tokens to authenticated;
grant delete on public.api_tokens to authenticated;

-- ─── RPC : CRÉER UN JETON ────────────────────────────────────
create or replace function public.create_api_token(p_label text default null)
  returns table (id uuid, token text, label text, token_hint text, created_at timestamptz)
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_label text := left(btrim(coalesce(p_label, '')), 60);
  v_token text;
  v_row public.api_tokens;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    perform public.raise_omk('profile_incomplete');
  end if;
  if (select count(*) from public.api_tokens t where t.owner_id = v_uid) >= 10 then
    perform public.raise_omk('too_many_api_tokens');
  end if;

  v_token := 'omk_' || encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.api_tokens (owner_id, label, token_hash, token_hint)
  values (
    v_uid,
    case when v_label = '' then 'IA' else v_label end,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    right(v_token, 4)
  )
  returning * into v_row;

  return query select v_row.id, v_token, v_row.label, v_row.token_hint, v_row.created_at;
end;
$$;

revoke execute on function public.create_api_token(text) from public, anon;
grant execute on function public.create_api_token(text) to authenticated;

-- ─── RÉSOLUTION DU JETON ─────────────────────────────────────
-- Rend le propriétaire du jeton et pose ses claims pour la transaction en
-- cours : les RPC appelées ensuite voient `auth.uid()` = ce propriétaire.
-- Jamais exposée : seules les fonctions `mcp_*` l'appellent.
create or replace function public.mcp_act_as(p_token text)
  returns uuid
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_token record;
begin
  if p_token is null or p_token !~ '^omk_[0-9a-f]{48}$' then
    perform public.raise_omk('invalid_api_token');
  end if;

  select t.id, t.owner_id, t.last_used_at
    into v_token
    from public.api_tokens t
   where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if not found then
    perform public.raise_omk('invalid_api_token');
  end if;

  -- Une écriture par minute au plus : une conversation enchaîne les appels.
  if v_token.last_used_at is null or v_token.last_used_at < now() - interval '1 minute' then
    update public.api_tokens set last_used_at = now() where id = v_token.id;
  end if;

  perform set_config('request.jwt.claim.sub', v_token.owner_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_token.owner_id, 'role', 'authenticated')::text,
    true
  );

  return v_token.owner_id;
end;
$$;

revoke execute on function public.mcp_act_as(text) from public, anon, authenticated;

-- ─── FORMES RENDUES ──────────────────────────────────────────
-- Un resto tel que l'IA le lit : l'essentiel, sans les colonnes techniques.
create or replace function public.mcp_restaurant_json(r public.restaurants)
  returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'cuisine_type', r.cuisine_type,
    'address', r.address,
    'city', r.city,
    'price_level', r.price_level,
    'tags', case when cardinality(r.tags) > 0 then to_jsonb(r.tags) end,
    'website', r.website,
    'source', r.source,
    'google_place_id', r.place_id
  ));
$$;

revoke execute on function public.mcp_restaurant_json(public.restaurants) from public, anon, authenticated;

-- Une liste : son nom, son code (qui fait l'URL), sa taille.
create or replace function public.mcp_list_json(l public.lists)
  returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id,
    'name', l.name,
    'share_code', l.share_code,
    'is_public', l.is_public,
    'is_collaborative', l.is_collaborative,
    'restaurant_count', (select count(*) from public.list_restaurants lr where lr.list_id = l.id),
    'updated_at', l.updated_at
  );
$$;

revoke execute on function public.mcp_list_json(public.lists) from public, anon, authenticated;

-- Liste du propriétaire, ou refus : le même message que la liste existe ou
-- non chez quelqu'un d'autre.
create or replace function public.mcp_owned_list(p_uid uuid, p_list_id uuid)
  returns public.lists
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_list public.lists;
begin
  select * into v_list from public.lists l where l.id = p_list_id and l.owner_id = p_uid;
  if not found then
    perform public.raise_omk('list_not_found');
  end if;
  return v_list;
end;
$$;

revoke execute on function public.mcp_owned_list(uuid, uuid) from public, anon, authenticated;

-- ─── RPC MCP : QUI SUIS-JE ───────────────────────────────────
create or replace function public.mcp_whoami(p_token text)
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := public.mcp_act_as(p_token);
begin
  return (
    select jsonb_build_object(
      'pseudo', p.pseudo,
      'list_count', (select count(*) from public.lists l where l.owner_id = v_uid)
    )
    from public.profiles p
    where p.id = v_uid
  );
end;
$$;

-- ─── RPC MCP : MES LISTES ────────────────────────────────────
create or replace function public.mcp_lists(p_token text)
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := public.mcp_act_as(p_token);
begin
  return coalesce(
    (
      select jsonb_agg(public.mcp_list_json(l) order by l.updated_at desc)
      from public.lists l
      where l.owner_id = v_uid
    ),
    '[]'::jsonb
  );
end;
$$;

-- ─── RPC MCP : UNE LISTE ET SES RESTOS ───────────────────────
create or replace function public.mcp_list(p_token text, p_list_id uuid)
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := public.mcp_act_as(p_token);
  v_list public.lists := public.mcp_owned_list(v_uid, p_list_id);
begin
  return public.mcp_list_json(v_list) || jsonb_build_object(
    'restaurants',
    coalesce(
      (
        select jsonb_agg(public.mcp_restaurant_json(r) order by lr.added_at)
        from public.list_restaurants lr
        join public.restaurants r on r.id = lr.restaurant_id
        where lr.list_id = v_list.id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

-- ─── RPC MCP : CRÉER UNE LISTE ───────────────────────────────
create or replace function public.mcp_create_list(p_token text, p_name text)
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := public.mcp_act_as(p_token);
  v_name text := btrim(coalesce(p_name, ''));
  v_list public.lists;
begin
  if char_length(v_name) = 0 then
    perform public.raise_omk('list_name_required');
  end if;
  if char_length(v_name) > 60 then
    perform public.raise_omk('list_name_too_long');
  end if;

  insert into public.lists (name, owner_id)
  values (v_name, v_uid)
  returning * into v_list;

  return public.mcp_list_json(v_list);
end;
$$;

-- ─── RPC MCP : CHERCHER DANS LE CATALOGUE ────────────────────
-- Deux filets : le nom ou la cuisine contient la recherche (ce que fait le
-- sélecteur de l'app), ou le nom lui ressemble (trigrammes — « la ba » trouve
-- « La Baraka »). Chaque resto dit dans lesquelles de MES listes il est déjà :
-- c'est la question que l'IA se pose avant d'ajouter quoi que ce soit.
create or replace function public.mcp_find_restaurants(
  p_token text,
  p_query text,
  p_city  text default null,
  p_limit int default 8
)
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := public.mcp_act_as(p_token);
  v_query text := btrim(coalesce(p_query, ''));
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_pattern text;
begin
  if char_length(v_query) < 2 or char_length(v_query) > 100 then
    perform public.raise_omk('invalid_search');
  end if;

  v_pattern := '%' ||
    replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') ||
    '%';

  return coalesce(
    (
      select jsonb_agg(
        public.mcp_restaurant_json(c.r) || jsonb_build_object(
          'in_my_lists',
          coalesce(
            (
              select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.name)
              from public.list_restaurants lr
              join public.lists l on l.id = lr.list_id
              where lr.restaurant_id = (c.r).id and l.owner_id = v_uid
            ),
            '[]'::jsonb
          )
        )
        order by c.score desc, (c.r).name
      )
      from (
        select r, greatest(
            extensions.similarity(r.name, v_query),
            case when r.name ilike v_pattern then 0.9 else 0 end,
            case when lower(r.name) = lower(v_query) then 1 else 0 end
          )
          -- Une ville qui correspond départage deux homonymes.
          + case when v_city is not null and r.city ilike v_city then 0.2 else 0 end
          as score
        from public.restaurants r
        where (
            r.name ilike v_pattern
            or coalesce(r.cuisine_type, '') ilike v_pattern
            or (
              r.name operator(extensions.%) v_query
              and extensions.similarity(r.name, v_query) >= 0.35
            )
          )
        order by score desc, r.name
        limit least(greatest(coalesce(p_limit, 8), 1), 20)
      ) c
    ),
    '[]'::jsonb
  );
end;
$$;

-- ─── RPC MCP : AJOUTER UN RESTO À LA MAIN ────────────────────
-- Mêmes règles que le formulaire de l'app : c'est la même fonction.
create or replace function public.mcp_create_restaurant(
  p_token        text,
  p_name         text,
  p_cuisine_type text default null,
  p_address      text default null,
  p_city         text default null,
  p_price_level  smallint default null,
  p_tags         text[] default null
)
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_restaurant public.restaurants;
begin
  perform public.mcp_act_as(p_token);
  v_restaurant := public.create_manual_restaurant(
    p_name, p_cuisine_type, p_address, p_city, p_price_level, p_tags
  );
  return public.mcp_restaurant_json(v_restaurant);
end;
$$;

-- ─── RPC MCP : IMPORTER UN LIEU GOOGLE ───────────────────────
-- Appelée par le serveur MCP après avoir relu la fiche chez Google : comme
-- dans l'app, aucun champ ne vient de l'IA, seulement l'identifiant du lieu.
create or replace function public.mcp_import_place(
  p_token         text,
  p_place_id      text,
  p_name          text,
  p_address       text default null,
  p_city          text default null,
  p_cuisine_type  text default null,
  p_price_level   smallint default null,
  p_description   text default null,
  p_photo_url     text default null,
  p_website       text default null,
  p_location      jsonb default null,
  p_opening_hours jsonb default null,
  p_tags          text[] default null
)
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_restaurant public.restaurants;
begin
  perform public.mcp_act_as(p_token);
  v_restaurant := public.upsert_restaurant_from_place(
    p_place_id, p_name, p_address, p_city, p_cuisine_type, p_price_level,
    p_description, p_photo_url, p_website, p_location, p_opening_hours, p_tags
  );
  return public.mcp_restaurant_json(v_restaurant);
end;
$$;

-- ─── RPC MCP : RANGER UN RESTO DANS UNE LISTE ────────────────
-- Idempotente : un resto déjà présent le reste, et la réponse le dit.
create or replace function public.mcp_add_to_list(
  p_token         text,
  p_list_id       uuid,
  p_restaurant_id uuid
)
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := public.mcp_act_as(p_token);
  v_list public.lists := public.mcp_owned_list(v_uid, p_list_id);
  v_restaurant public.restaurants;
  v_added boolean;
begin
  select * into v_restaurant from public.restaurants r where r.id = p_restaurant_id;
  if not found then
    perform public.raise_omk('restaurant_not_found');
  end if;

  insert into public.list_restaurants (list_id, restaurant_id)
  values (v_list.id, v_restaurant.id)
  on conflict (list_id, restaurant_id) do nothing;
  v_added := found;

  if v_added then
    -- La liste remonte en tête de « Mes listes », comme après un ajout dans l'app.
    update public.lists set updated_at = now() where id = v_list.id returning * into v_list;
  end if;

  return jsonb_build_object(
    'added', v_added,
    'already_in_list', not v_added,
    'list', public.mcp_list_json(v_list),
    'restaurant', public.mcp_restaurant_json(v_restaurant)
  );
end;
$$;

-- ─── RPC MCP : RETIRER UN RESTO D'UNE LISTE ──────────────────
create or replace function public.mcp_remove_from_list(
  p_token         text,
  p_list_id       uuid,
  p_restaurant_id uuid
)
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := public.mcp_act_as(p_token);
  v_list public.lists := public.mcp_owned_list(v_uid, p_list_id);
  v_removed boolean;
begin
  delete from public.list_restaurants
   where list_id = v_list.id and restaurant_id = p_restaurant_id;
  v_removed := found;

  if v_removed then
    update public.lists set updated_at = now() where id = v_list.id returning * into v_list;
  end if;

  return jsonb_build_object('removed', v_removed, 'list', public.mcp_list_json(v_list));
end;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
-- Ouvertes à `anon` : le serveur MCP appelle avec la clé publiable, et c'est
-- le jeton, revérifié par `mcp_act_as`, qui fait l'autorisation.
revoke execute on function public.mcp_whoami(text) from public;
grant execute on function public.mcp_whoami(text) to anon, authenticated;

revoke execute on function public.mcp_lists(text) from public;
grant execute on function public.mcp_lists(text) to anon, authenticated;

revoke execute on function public.mcp_list(text, uuid) from public;
grant execute on function public.mcp_list(text, uuid) to anon, authenticated;

revoke execute on function public.mcp_create_list(text, text) from public;
grant execute on function public.mcp_create_list(text, text) to anon, authenticated;

revoke execute on function public.mcp_find_restaurants(text, text, text, int) from public;
grant execute on function public.mcp_find_restaurants(text, text, text, int) to anon, authenticated;

revoke execute on function public.mcp_create_restaurant(
  text, text, text, text, text, smallint, text[]
) from public;
grant execute on function public.mcp_create_restaurant(
  text, text, text, text, text, smallint, text[]
) to anon, authenticated;

revoke execute on function public.mcp_import_place(
  text, text, text, text, text, text, smallint, text, text, text, jsonb, jsonb, text[]
) from public;
grant execute on function public.mcp_import_place(
  text, text, text, text, text, text, smallint, text, text, text, jsonb, jsonb, text[]
) to anon, authenticated;

revoke execute on function public.mcp_add_to_list(text, uuid, uuid) from public;
grant execute on function public.mcp_add_to_list(text, uuid, uuid) to anon, authenticated;

revoke execute on function public.mcp_remove_from_list(text, uuid, uuid) from public;
grant execute on function public.mcp_remove_from_list(text, uuid, uuid) to anon, authenticated;

-- ─── EXPORT RGPD ─────────────────────────────────────────────
-- Corps repris tel quel de `20260929170000_push_locale.sql`, avec les jetons
-- d'accès IA en plus.
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

    -- Les jetons d'accès IA : leur nom et leur usage, jamais leur empreinte.
    'api_tokens', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'label', t.label,
          'token_hint', t.token_hint,
          'created_at', t.created_at,
          'last_used_at', t.last_used_at
        )
        order by t.created_at
      )
      from public.api_tokens t
      where t.owner_id = v_uid
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
