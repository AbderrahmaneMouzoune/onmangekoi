-- ============================================================
-- onmangekoi — scénario : « autour de moi » sur le catalogue
-- ============================================================
-- Couvre `public.geo_distance_km` et `public.restaurants_nearby`
-- (migration 20260907120000) :
--   * le rayon borne réellement les résultats, et le tri va du plus proche
--     au plus loin ;
--   * un resto sans coordonnées n'apparaît jamais ;
--   * la recherche texte se combine au rayon, jokers ILIKE neutralisés ;
--   * la pagination reste cohérente d'une page à l'autre ;
--   * les valeurs aberrantes (rayon négatif, latitude hors bornes) ne
--     renvoient rien plutôt que n'importe quoi.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/nearby.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert(p_ok boolean, p_label text)
  returns void
  language plpgsql
as $$
begin
  if p_ok is not true then
    raise exception 'ÉCHEC — %', p_label;
  end if;
  raise notice 'ok — %', p_label;
end;
$$;

-- ─── JEU D'ESSAI ─────────────────────────────────────────────
-- Position de référence : place de la Bastille, Paris.
-- Les noms sont préfixés pour ne jamais se mélanger au seed.
insert into public.restaurants (name, cuisine_type, location) values
  ('zz Coin',      'Libanais', '{"lat": 48.855,  "lng": 2.3707}'::jsonb),  -- ~240 m
  ('zz Quartier',  'Coréen',   '{"lat": 48.8719, "lng": 2.3816}'::jsonb),  -- ~2,3 km
  ('zz Banlieue',  'Libanais', '{"lat": 48.94,   "lng": 2.36}'::jsonb),    -- ~9,7 km
  ('zz Sans GPS',  'Libanais', null),
  ('zz Lyon',      'Bouchon',  '{"lat": 45.76,   "lng": 4.83}'::jsonb),    -- ~390 km
  ('zz 100% Végétal', 'Végétarien', '{"lat": 48.8535, "lng": 2.3695}'::jsonb);

create or replace function pg_temp.nearby(
  p_radius_km double precision default 5,
  p_query     text default null,
  p_limit     int default 20,
  p_offset    int default 0
)
  returns text[]
  language sql
as $$
  select coalesce(array_agg(name order by ordinality), '{}')
  from public.restaurants_nearby(48.8531, 2.3691, p_radius_km, p_query, p_limit, p_offset)
    with ordinality
  where name like 'zz %';
$$;

-- ─── DISTANCE ────────────────────────────────────────────────
select pg_temp.assert(
  public.geo_distance_km('{"lat": 48.8531, "lng": 2.3691}'::jsonb, 48.8531, 2.3691) = 0,
  'geo_distance_km : nulle sur le point lui-même'
);

select pg_temp.assert(
  round(public.geo_distance_km(
    '{"lat": 48.855, "lng": 2.3707}'::jsonb, 48.8531, 2.3691
  )::numeric, 2) between 0.20 and 0.28,
  'geo_distance_km : environ 240 m entre Bastille et le resto du coin'
);

select pg_temp.assert(
  public.geo_distance_km(null, 48.8531, 2.3691) is null
    and public.geo_distance_km('{"lat": "ici"}'::jsonb, 48.8531, 2.3691) is null,
  'geo_distance_km : rien à mesurer sans point exploitable'
);

-- ─── RAYON ET TRI ────────────────────────────────────────────
select pg_temp.assert(
  pg_temp.nearby(1) = array['zz 100% Végétal', 'zz Coin'],
  'un rayon d''un kilomètre ne ramène que le pâté de maisons, du plus proche au plus loin'
);

select pg_temp.assert(
  pg_temp.nearby(5) = array['zz 100% Végétal', 'zz Coin', 'zz Quartier'],
  'cinq kilomètres ajoutent le resto du quartier, sans casser l''ordre'
);

select pg_temp.assert(
  'zz Banlieue' = any (pg_temp.nearby(20)),
  'vingt kilomètres atteignent la banlieue'
);

select pg_temp.assert(
  not ('zz Sans GPS' = any (pg_temp.nearby(50))),
  'un resto sans coordonnées n''apparaît sous aucun rayon'
);

-- ─── RECHERCHE COMBINÉE ──────────────────────────────────────
select pg_temp.assert(
  pg_temp.nearby(50, 'quartier') = array['zz Quartier'],
  'la recherche par nom se combine au rayon'
);

select pg_temp.assert(
  pg_temp.nearby(50, 'libanais') = array['zz Coin', 'zz Banlieue'],
  'la recherche porte aussi sur la cuisine, toujours triée par distance'
);

select pg_temp.assert(
  pg_temp.nearby(50, '100%') = array['zz 100% Végétal'],
  'un « % » cherché reste littéral'
);

select pg_temp.assert(
  pg_temp.nearby(50, 'zz_100') = '{}',
  'un « _ » cherché ne joue pas le joker'
);

select pg_temp.assert(
  pg_temp.nearby(50, '   ') = pg_temp.nearby(50),
  'une recherche vide ne filtre rien'
);

-- ─── PAGINATION ──────────────────────────────────────────────
select pg_temp.assert(
  pg_temp.nearby(5, null, 2, 0) = array['zz 100% Végétal', 'zz Coin']
    and pg_temp.nearby(5, null, 2, 2) = array['zz Quartier'],
  'la pagination découpe la même liste sans doublon ni trou'
);

-- ─── VALEURS ABERRANTES ──────────────────────────────────────
select pg_temp.assert(
  pg_temp.nearby(-10) = array['zz 100% Végétal'],
  'un rayon négatif est ramené à 100 m, pas au tour du monde'
);

select pg_temp.assert(
  not ('zz Lyon' = any (pg_temp.nearby(100000))),
  'un rayon démesuré est ramené à 50 km : Lyon reste hors de portée'
);

select pg_temp.assert(
  (select count(*) from public.restaurants_nearby(91, 2.3691, 50)) = 0
    and (select count(*) from public.restaurants_nearby(48.8531, 200, 50)) = 0,
  'une coordonnée hors bornes ne ramène rien'
);

rollback;
