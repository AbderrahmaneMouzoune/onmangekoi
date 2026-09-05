-- ============================================================
-- onmangekoi — fiche restaurant enrichie
-- ============================================================
--   * `restaurants.image_url` devient `photo_url` : une seule colonne photo,
--     alimentée plus tard par l'import Google Places.
--   * Nouvelles colonnes `website`, `location` (jsonb {lat, lng}) et
--     `opening_hours` (jsonb {timezone?, periods[]}).
--   * Les formes jsonb sont validées en base par des fonctions `immutable`
--     pour qu'aucune écriture ne puisse déposer une structure inexploitable.
--   * `session_results` renvoie ces colonnes : la page de classement affiche
--     l'adresse, l'itinéraire et la mini-carte du gagnant.
-- ============================================================

-- ─── COLONNES ────────────────────────────────────────────────
alter table public.restaurants rename column image_url to photo_url;

alter table public.restaurants
  add column website       text,
  add column location      jsonb,
  add column opening_hours jsonb;

comment on column public.restaurants.photo_url is
  'Photo de la fiche. HTTPS uniquement, sur un hôte autorisé par next/image.';
comment on column public.restaurants.location is
  'Coordonnées WGS84 : {"lat": number, "lng": number}.';
comment on column public.restaurants.opening_hours is
  'Horaires : {"timezone"?: string, "periods": [{"day": 0-6 (0 = dimanche), "open": "HH:MM", "close": "HH:MM"}]}. '
  'Une période dont la fermeture précède l''ouverture passe minuit.';

-- ─── VALIDATION DES FORMES JSONB ─────────────────────────────
-- `immutable` : indispensable pour être appelées depuis une contrainte CHECK.

create or replace function public.is_geo_point(p_value jsonb)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select p_value is null or (
    jsonb_typeof(p_value) = 'object'
    and jsonb_typeof(p_value -> 'lat') = 'number'
    and jsonb_typeof(p_value -> 'lng') = 'number'
    and (p_value ->> 'lat')::numeric between -90 and 90
    and (p_value ->> 'lng')::numeric between -180 and 180
  );
$$;

create or replace function public.is_opening_hours(p_value jsonb)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select p_value is null or (
    jsonb_typeof(p_value) = 'object'
    and jsonb_typeof(p_value -> 'periods') = 'array'
    and coalesce(jsonb_typeof(p_value -> 'timezone'), 'string') = 'string'
    and not exists (
      select 1
      from jsonb_array_elements(p_value -> 'periods') as period
      where coalesce(jsonb_typeof(period), 'null') <> 'object'
        or coalesce(jsonb_typeof(period -> 'day'), 'null') <> 'number'
        or (period ->> 'day')::numeric not in (0, 1, 2, 3, 4, 5, 6)
        or coalesce(period ->> 'open', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(period ->> 'close', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
    )
  );
$$;

alter table public.restaurants
  add constraint restaurants_photo_url_https
    check (photo_url is null or photo_url ~ '^https://'),
  add constraint restaurants_website_http
    check (website is null or website ~ '^https?://'),
  add constraint restaurants_location_shape
    check (public.is_geo_point(location)),
  add constraint restaurants_opening_hours_shape
    check (public.is_opening_hours(opening_hours));

-- ─── RPC : RÉSULTATS ─────────────────────────────────────────
-- Le type de retour change : il faut supprimer avant de recréer.
drop function if exists public.session_results(uuid);

create function public.session_results(p_session_id uuid)
  returns table (
    session_restaurant_id uuid,
    restaurant_id uuid,
    name text,
    cuisine_type text,
    description text,
    photo_url text,
    address text,
    city text,
    website text,
    location jsonb,
    opening_hours jsonb,
    restaurant_position int,
    score int,
    superlikes int,
    likes int,
    dislikes int,
    super_dislikes int,
    votes_count int,
    rank int
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select
    sr.id,
    r.id,
    r.name,
    r.cuisine_type,
    r.description,
    r.photo_url,
    r.address,
    r.city,
    r.website,
    r.location,
    r.opening_hours,
    sr.position as restaurant_position,
    coalesce(sum(v.value), 0)::int as score,
    (count(*) filter (where v.value = 2))::int as superlikes,
    (count(*) filter (where v.value = 1))::int as likes,
    (count(*) filter (where v.value = 0))::int as dislikes,
    (count(*) filter (where v.value = -2))::int as super_dislikes,
    count(v.id)::int as votes_count,
    (rank() over (
      order by coalesce(sum(v.value), 0) desc,
               count(*) filter (where v.value = 2) desc
    ))::int as rank
  from public.session_restaurants sr
  join public.restaurants r on r.id = sr.restaurant_id
  left join public.votes v on v.session_restaurant_id = sr.id
  where sr.session_id = p_session_id
    and public.is_session_participant(p_session_id)
    and exists (
      select 1 from public.sessions s
      where s.id = p_session_id and s.status = 'closed'
    )
  group by sr.id, r.id, sr.position
  order by rank, sr.position;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
-- Les droits d'une fonction disparaissent avec elle : on les repose.
-- `is_geo_point` et `is_opening_hours` restent exécutables par tous : une
-- contrainte CHECK est évaluée avec les droits de celui qui écrit, les révoquer
-- casserait toute écriture future sur `restaurants`. Ce sont des prédicats purs
-- sur leur seul argument, ils n'exposent rien.
revoke execute on function public.session_results(uuid) from public, anon;
grant execute on function public.session_results(uuid) to authenticated;
