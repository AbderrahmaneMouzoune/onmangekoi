-- ============================================================
-- onmangekoi — « autour de moi » sur la base de restaurants
-- ============================================================
--   * `geo_distance_km` : distance orthodromique entre un point stocké en
--     base (`restaurants.location`) et une position donnée. Pure, `immutable`,
--     donc utilisable en `where` comme en `order by`.
--   * `restaurants_nearby` : page du catalogue triée par distance, filtrée par
--     rayon, et combinable avec la recherche texte du sélecteur. C'est la seule
--     manière de trier par distance : PostgREST ne sait pas ordonner sur une
--     expression calculée.
--   * Index d'expression sur la latitude et la longitude : la boîte
--     englobante écarte l'essentiel du catalogue avant que la trigonométrie
--     ne tranche au kilomètre près.
--
-- Un resto sans `location` n'apparaît jamais ici — on ne sait pas où il est,
-- l'inventer serait pire que de l'omettre. La recherche par nom, elle, le
-- trouve toujours.
-- ============================================================

-- ─── DISTANCE ────────────────────────────────────────────────
-- Haversine sur une sphère de rayon moyen 6371,0088 km : à l'échelle d'un
-- déjeuner, l'écart avec un calcul ellipsoïdal se compte en mètres.
create or replace function public.geo_distance_km(
  p_location jsonb,
  p_lat      double precision,
  p_lng      double precision
)
  returns double precision
  language sql
  immutable
  parallel safe
  set search_path = ''
as $$
  select case
    when p_location is null
      or not public.is_geo_point(p_location)
      or p_lat is null
      or p_lng is null
    then null
    else 2 * 6371.0088 * asin(least(1, sqrt(
      sin(radians((p_location ->> 'lat')::double precision - p_lat) / 2) ^ 2
      + cos(radians(p_lat))
        * cos(radians((p_location ->> 'lat')::double precision))
        * sin(radians((p_location ->> 'lng')::double precision - p_lng) / 2) ^ 2
    )))
  end;
$$;

comment on function public.geo_distance_km(jsonb, double precision, double precision) is
  'Distance en kilomètres entre un point {"lat","lng"} et une position. NULL si le point est absent ou malformé.';

-- Sert la boîte englobante de `restaurants_nearby`. Partiel : les restos sans
-- coordonnées ne sont jamais candidats, autant les laisser hors de l'index.
create index if not exists idx_restaurants_location_lat_lng
  on public.restaurants (
    ((location ->> 'lat')::double precision),
    ((location ->> 'lng')::double precision)
  )
  where location is not null;

-- ─── RPC : RESTOS LES PLUS PROCHES ───────────────────────────
-- `security invoker` : la table est publique en lecture (policy
-- `restaurants_select_public`), la RPC n'a aucun privilège à emprunter.
create or replace function public.restaurants_nearby(
  p_lat       double precision,
  p_lng       double precision,
  p_radius_km double precision default 5,
  p_query     text default null,
  p_limit     int default 20,
  p_offset    int default 0
)
  returns setof public.restaurants
  language sql
  stable
  set search_path = ''
as $$
  with bounds as (
    select
      least(greatest(coalesce(p_radius_km, 5), 0.1), 50) as radius_km,
      -- Les jokers ILIKE sont neutralisés : une recherche « 100% » reste
      -- littérale, comme dans `searchRestaurants` côté application.
      case
        when char_length(btrim(coalesce(p_query, ''))) = 0 then null
        else '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as pattern
  ),
  box as (
    select
      radius_km,
      pattern,
      radius_km / 111.045 as lat_delta,
      -- Un degré de longitude rétrécit avec la latitude ; près des pôles la
      -- boîte couvrirait le tour du monde, on la laisse alors tomber et la
      -- distance exacte tranche seule.
      case
        when cos(radians(p_lat)) < 0.01 then 180
        else least(radius_km / (111.045 * cos(radians(p_lat))), 180)
      end as lng_delta
    from bounds
  )
  select r.*
  from public.restaurants r, box b
  where p_lat between -90 and 90
    and p_lng between -180 and 180
    and r.location is not null
    and (r.location ->> 'lat')::double precision between p_lat - b.lat_delta and p_lat + b.lat_delta
    and (
      -- Boîte à cheval sur l'antiméridien : le filtre longitude ne veut plus
      -- rien dire en intervalle simple, la distance exacte suffit.
      b.lng_delta >= 180
      or p_lng - b.lng_delta < -180
      or p_lng + b.lng_delta > 180
      or (r.location ->> 'lng')::double precision between p_lng - b.lng_delta and p_lng + b.lng_delta
    )
    and public.geo_distance_km(r.location, p_lat, p_lng) <= b.radius_km
    and (
      b.pattern is null
      or r.name ilike b.pattern
      or r.cuisine_type ilike b.pattern
    )
  order by public.geo_distance_km(r.location, p_lat, p_lng), r.name
  limit least(greatest(coalesce(p_limit, 20), 1), 51)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.restaurants_nearby(
  double precision, double precision, double precision, text, int, int
) is
  'Catalogue trié par distance croissante, borné par un rayon en kilomètres et filtrable par nom ou cuisine.';

-- ─── GRANTS ──────────────────────────────────────────────────
-- `geo_distance_km` reste exécutable par tous, comme `is_geo_point` : c'est un
-- calcul pur sur ses arguments, il n'ouvre l'accès à rien.
-- Le catalogue est lu par le client anonyme (cache partagé côté application) :
-- `anon` a besoin de la RPC autant qu'`authenticated`.
revoke execute on function public.restaurants_nearby(
  double precision, double precision, double precision, text, int, int
) from public;
grant execute on function public.restaurants_nearby(
  double precision, double precision, double precision, text, int, int
) to anon, authenticated;
