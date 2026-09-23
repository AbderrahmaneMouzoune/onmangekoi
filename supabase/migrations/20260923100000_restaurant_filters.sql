-- ============================================================
-- onmangekoi — filtres du catalogue : budget, régime, distance
-- ============================================================
--   * `restaurants.tags text[]` : les régimes qu'un resto sait servir
--     (`vegetarian`, `vegan`, `halal`, `kosher`, `gluten_free`). La liste
--     blanche vit en base, dans `restaurant_tag_values()` : la contrainte
--     CHECK, la normalisation et les deux RPC d'écriture s'y réfèrent, donc
--     il n'y a qu'un seul endroit à modifier pour en ajouter un.
--   * `search_restaurants()` : la recherche du sélecteur passe désormais par
--     une RPC unique — texte, budget maximum, régimes, rayon autour d'un
--     point. Filtrer en base est la seule façon de garder la pagination
--     juste quand les filtres se combinent : une page filtrée après coup
--     côté client sauterait des résultats à chaque « Afficher plus ».
--   * `geo_distance_km()` : haversine sur le point jsonb déjà stocké par
--     `restaurant_details`. Pas de PostGIS pour un rayon de quartier.
--
-- Un resto dont la donnée manque sort des résultats dès que le filtre
-- correspondant est posé : budget inconnu sous « ≤ €€ », aucun régime
-- déclaré sous « vegan », coordonnées absentes sous un rayon. On ne prétend
-- pas savoir ce qu'on ne sait pas — l'interface le dit à la personne.
-- ============================================================

-- ─── RÉGIMES : LA LISTE BLANCHE ──────────────────────────────
-- `immutable` : appelée depuis une contrainte CHECK, donc obligatoire.
create or replace function public.restaurant_tag_values()
  returns text[]
  language sql
  immutable
  set search_path = ''
as $$
  select array['gluten_free', 'halal', 'kosher', 'vegan', 'vegetarian']::text[];
$$;

create or replace function public.is_restaurant_tags(p_value text[])
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select p_value is null or not exists (
    select 1
    from unnest(p_value) as tag
    where tag is null or tag <> all (public.restaurant_tag_values())
  );
$$;

-- Écriture propre : on ne garde que les régimes connus, une seule fois
-- chacun, toujours dans le même ordre. Deux restos tagués pareil ont donc
-- exactement le même tableau, et `@>` travaille sur une base normalisée.
create or replace function public.normalize_restaurant_tags(p_tags text[])
  returns text[]
  language sql
  immutable
  set search_path = ''
as $$
  select coalesce(
    (
      select array_agg(distinct tag order by tag)
      from unnest(coalesce(p_tags, '{}'::text[])) as tag
      where tag = any (public.restaurant_tag_values())
    ),
    '{}'::text[]
  );
$$;

-- ─── COLONNE ─────────────────────────────────────────────────
-- La colonne est neuve : toutes les lignes valent `{}`, la contrainte est
-- donc vérifiable immédiatement sans `not valid`.
alter table public.restaurants
  add column if not exists tags text[] not null default '{}'::text[];

comment on column public.restaurants.tags is
  'Régimes servis, parmi restaurant_tag_values() : vegetarian, vegan, halal, kosher, gluten_free. '
  'Tableau normalisé (dédoublonné, trié). Vide = non renseigné, jamais « aucun régime ».';

alter table public.restaurants
  drop constraint if exists restaurants_tags_allowed;
alter table public.restaurants
  add constraint restaurants_tags_allowed
  check (public.is_restaurant_tags(tags));

-- `@>` sur un text[] : index GIN, comme la recherche trigram sur le nom.
create index if not exists idx_restaurants_tags
  on public.restaurants using gin (tags);

create index if not exists idx_restaurants_price_level
  on public.restaurants (price_level)
  where price_level is not null;

-- Le créateur peut corriger les régimes de sa fiche, comme le budget.
-- `grant` s'ajoute à la liste blanche posée par `manual_restaurants` : les
-- colonnes venues de Google (`location`, `opening_hours`) restent hors
-- d'atteinte d'une édition à la main.
grant update (tags) on public.restaurants to authenticated;

-- ─── DISTANCE ────────────────────────────────────────────────
-- Haversine sur la sphère (rayon moyen 6371 km). Précision largement
-- suffisante pour un rayon de quartier, et rien à installer.
-- `null` dès qu'un point manque ou qu'il est mal formé : la comparaison
-- `<= rayon` est alors fausse, donc le resto sort des résultats.
create or replace function public.geo_distance_km(
  p_point jsonb,
  p_lat   double precision,
  p_lng   double precision
)
  returns double precision
  language sql
  immutable
  set search_path = ''
as $$
  select case
    when p_point is null or p_lat is null or p_lng is null then null
    when not public.is_geo_point(p_point) then null
    else 2 * 6371 * asin(least(1, sqrt(
      power(sin(radians(((p_point ->> 'lat')::double precision - p_lat) / 2)), 2)
      + cos(radians(p_lat))
        * cos(radians((p_point ->> 'lat')::double precision))
        * power(sin(radians(((p_point ->> 'lng')::double precision - p_lng) / 2)), 2)
    )))
  end;
$$;

-- ─── RPC : RECHERCHE FILTRÉE ─────────────────────────────────
-- Le catalogue est public : la RPC est `stable`, sans `security definer`,
-- et lit donc sous la policy `restaurants_select_public`.
--
-- `p_limit` est le nombre de lignes voulues, bornes comprises : le client en
-- demande une de plus que sa page pour savoir s'il en reste — d'où un
-- plafond à 100 alors qu'une page en fait 20.
create or replace function public.search_restaurants(
  p_query     text default null,
  p_price_max smallint default null,
  p_tags      text[] default null,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_within_km double precision default null,
  p_limit     int default 20,
  p_offset    int default 0
)
  returns setof public.restaurants
  language sql
  stable
  set search_path = ''
as $$
  with params as (
    select
      -- Les jokers saisis restent littéraux : chercher « 100% » cherche
      -- bien « 100% », pas « 100 suivi de n'importe quoi ».
      case
        when char_length(btrim(coalesce(p_query, ''))) = 0 then null
        else '%' ||
             replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') ||
             '%'
      end as pattern,
      case when p_price_max between 1 and 4 then p_price_max end as price_max,
      public.normalize_restaurant_tags(p_tags) as tags,
      -- Un rayon sans position, ou une position hors bornes, ne filtre rien :
      -- mieux vaut le catalogue entier qu'un écran vide inexplicable.
      case
        when p_lat is null or p_lng is null then null
        when p_lat not between -90 and 90 or p_lng not between -180 and 180 then null
        when coalesce(p_within_km, 0) <= 0 then null
        else least(p_within_km, 50)
      end as within_km
  )
  select r.*
  from public.restaurants r, params p
  where (
      p.pattern is null
      or r.name ilike p.pattern
      or coalesce(r.cuisine_type, '') ilike p.pattern
    )
    -- `price_level` nul ⇒ comparaison nulle ⇒ ligne écartée : un budget
    -- inconnu n'est pas un budget modeste.
    and (p.price_max is null or r.price_level <= p.price_max)
    and (cardinality(p.tags) = 0 or r.tags @> p.tags)
    and (
      p.within_km is null
      or public.geo_distance_km(r.location, p_lat, p_lng) <= p.within_km
    )
  -- Rayon actif : du plus proche au plus loin. Sinon l'ordre alphabétique
  -- habituel. `id` ferme le tri : deux restos homonymes ne peuvent pas
  -- s'échanger de page entre deux « Afficher plus ».
  order by
    case
      when p.within_km is null then null::double precision
      else public.geo_distance_km(r.location, p_lat, p_lng)
    end,
    r.name,
    r.id
  -- Bornes posées sur les paramètres eux-mêmes : une page ne peut ni être
  -- vide, ni ramener la base entière d'un coup.
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ─── RPC : AJOUT MANUEL (régimes) ────────────────────────────
-- La signature change : `create or replace` créerait une surcharge, et deux
-- surcharges rendraient l'appel PostgREST ambigu. On supprime d'abord — les
-- droits partent avec la fonction, ils sont reposés plus bas.
drop function if exists public.create_manual_restaurant(text, text, text, text, smallint);

create function public.create_manual_restaurant(
  p_name        text,
  p_cuisine_type text default null,
  p_address     text default null,
  p_city        text default null,
  p_price_level smallint default null,
  p_tags        text[] default null
)
  returns public.restaurants
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_restaurant public.restaurants;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and pseudo is not null) then
    perform public.raise_omk('profile_incomplete');
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    perform public.raise_omk('invalid_restaurant_name');
  end if;
  if p_price_level is not null and p_price_level not between 1 and 4 then
    perform public.raise_omk('invalid_price_level');
  end if;
  -- Un régime inconnu est une faute de saisie du client, pas une donnée à
  -- ignorer en silence : ici on refuse, l'interface saura le dire.
  if not public.is_restaurant_tags(p_tags) then
    perform public.raise_omk('invalid_tags');
  end if;

  insert into public.restaurants (
    name, cuisine_type, address, city, price_level, tags, created_by, source
  )
  values (
    v_name,
    nullif(btrim(coalesce(p_cuisine_type, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    p_price_level,
    public.normalize_restaurant_tags(p_tags),
    v_uid,
    'manual'
  )
  returning * into v_restaurant;

  return v_restaurant;
end;
$$;

-- ─── RPC : IMPORT GOOGLE (régimes) ───────────────────────────
-- Google ne connaît qu'un régime (`servesVegetarianFood`). Il s'ajoute à ce
-- qu'on sait déjà du lieu au lieu de le remplacer : un « halal » posé à la
-- main survit à un réimport, et le tableau reste normalisé.
drop function if exists public.upsert_restaurant_from_place(
  text, text, text, text, text, smallint, text, text, text, jsonb, jsonb
);

create function public.upsert_restaurant_from_place(
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
  returns public.restaurants
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_place_id text := btrim(coalesce(p_place_id, ''));
  v_name text := btrim(coalesce(p_name, ''));
  -- Les champs enrichis sont facultatifs : une forme que la base refuserait
  -- est écartée plutôt que de faire échouer tout l'import. Les contraintes
  -- CHECK de `restaurant_details` lèveraient une erreur Postgres brute, sans
  -- code `omk:` — l'utilisateur ne saurait pas quoi en faire, et perdre la
  -- photo vaut mieux que perdre le resto.
  v_photo_url text := case
    when p_photo_url ~ '^https://' then p_photo_url else null end;
  v_website text := case
    when p_website ~ '^https?://' then p_website else null end;
  v_location jsonb := case
    when public.is_geo_point(p_location) then p_location else null end;
  v_opening_hours jsonb := case
    when public.is_opening_hours(p_opening_hours) then p_opening_hours else null end;
  -- Même logique pour les régimes : ce que Google renvoie d'inconnu tombe.
  v_tags text[] := public.normalize_restaurant_tags(p_tags);
  v_restaurant public.restaurants;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and pseudo is not null) then
    perform public.raise_omk('profile_incomplete');
  end if;
  if v_place_id = '' or char_length(v_place_id) > 255 then
    perform public.raise_omk('invalid_place');
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    perform public.raise_omk('invalid_restaurant_name');
  end if;
  if p_price_level is not null and p_price_level not between 1 and 4 then
    perform public.raise_omk('invalid_price_level');
  end if;

  -- Réunion des régimes déjà connus et de ceux que Google annonce. Calculée
  -- avant l'insertion plutôt que dans le `on conflict` : la fusion reste
  -- lisible, et deux imports simultanés du même lieu se départagent de toute
  -- façon sur l'index unique.
  v_tags := public.normalize_restaurant_tags(
    coalesce(
      (select r.tags from public.restaurants r where r.place_id = v_place_id),
      '{}'::text[]
    ) || v_tags
  );

  insert into public.restaurants (
    name, cuisine_type, address, city, price_level, description,
    photo_url, website, location, opening_hours, tags,
    place_id, created_by, source
  )
  values (
    v_name,
    nullif(btrim(coalesce(p_cuisine_type, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    p_price_level,
    nullif(btrim(coalesce(p_description, '')), ''),
    v_photo_url,
    v_website,
    v_location,
    v_opening_hours,
    v_tags,
    v_place_id,
    v_uid,
    'google'
  )
  on conflict (place_id) do update set
    -- Le lieu est déjà en base : on rafraîchit ce que Google sait de lui,
    -- sans écraser le premier importateur ni perdre une valeur déjà connue.
    -- La photo se rafraîchit ainsi d'elle-même : l'URL servie par Google
    -- n'est pas éternelle, un réimport la remplace.
    name          = excluded.name,
    cuisine_type  = coalesce(excluded.cuisine_type, public.restaurants.cuisine_type),
    address       = coalesce(excluded.address, public.restaurants.address),
    city          = coalesce(excluded.city, public.restaurants.city),
    price_level   = coalesce(excluded.price_level, public.restaurants.price_level),
    description   = coalesce(excluded.description, public.restaurants.description),
    photo_url     = coalesce(excluded.photo_url, public.restaurants.photo_url),
    website       = coalesce(excluded.website, public.restaurants.website),
    location      = coalesce(excluded.location, public.restaurants.location),
    opening_hours = coalesce(excluded.opening_hours, public.restaurants.opening_hours),
    tags          = excluded.tags,
    created_by    = coalesce(public.restaurants.created_by, excluded.created_by)
  returning * into v_restaurant;

  return v_restaurant;
end;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
-- `restaurant_tag_values`, `is_restaurant_tags` et `normalize_restaurant_tags`
-- restent exécutables par tous, comme `is_geo_point` : une contrainte CHECK
-- est évaluée avec les droits de celui qui écrit, les révoquer casserait
-- toute écriture sur `restaurants`. Ce sont des fonctions pures sur leur
-- seul argument, elles n'exposent rien.
revoke execute on function public.geo_distance_km(jsonb, double precision, double precision)
  from public;
grant execute on function public.geo_distance_km(jsonb, double precision, double precision)
  to anon, authenticated;

-- Le catalogue est public : la recherche l'est aussi, y compris avant qu'un
-- pseudo soit choisi — c'est elle qui alimente le cache partagé des pages
-- « nouvelle session » et « nouvelle liste ».
revoke execute on function public.search_restaurants(
  text, smallint, text[], double precision, double precision, double precision, int, int
) from public;
grant execute on function public.search_restaurants(
  text, smallint, text[], double precision, double precision, double precision, int, int
) to anon, authenticated;

revoke execute on function public.create_manual_restaurant(
  text, text, text, text, smallint, text[]
) from public, anon;
grant execute on function public.create_manual_restaurant(
  text, text, text, text, smallint, text[]
) to authenticated;

revoke execute on function public.upsert_restaurant_from_place(
  text, text, text, text, text, smallint, text, text, text, jsonb, jsonb, text[]
) from public, anon;
grant execute on function public.upsert_restaurant_from_place(
  text, text, text, text, text, smallint, text, text, text, jsonb, jsonb, text[]
) to authenticated;
