-- ============================================================
-- onmangekoi — scénario : filtres budget, régime et distance
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #4 :
--   * les filtres se combinent, et la pagination reste juste sous filtres —
--     deux pages consécutives ne se recouvrent pas et n'oublient personne ;
--   * une donnée absente sort des résultats dès que le filtre correspondant
--     est posé : budget inconnu, aucun régime déclaré, pas de coordonnées ;
--   * les régimes sont normalisés à l'écriture (dédoublonnés, triés) et la
--     base refuse tout ce qui n'est pas dans `restaurant_tag_values()` ;
--   * un rayon trie du plus proche au plus loin.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/restaurant-filters.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set host '33333333-3333-4333-8333-333333333333'

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

-- Exécute un appel et renvoie le message d'erreur levé, ou null s'il passe.
create or replace function pg_temp.error_of(p_sql text)
  returns text
  language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception
  when others then return sqlerrm;
end;
$$;

-- Noms des restos rendus par une recherche, dans l'ordre où elle les rend.
create or replace function pg_temp.found(
  p_price_max smallint default null,
  p_tags      text[] default null,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_within_km double precision default null,
  p_limit     int default 20,
  p_offset    int default 0
)
  returns text[]
  language sql
as $$
  select coalesce(array_agg(s.name order by s.ordinality), '{}'::text[])
  from public.search_restaurants(
    'zzfiltre', p_price_max, p_tags, p_lat, p_lng, p_within_km, p_limit, p_offset
  ) with ordinality as s;
$$;

-- ─── FIXTURES ────────────────────────────────────────────────
-- Un préfixe commun : la recherche textuelle isole ces quatre lignes du
-- catalogue seedé, et chaque assertion porte donc sur un ensemble connu.
--
-- Les coordonnées sont alignées sur le même méridien depuis Châtelet :
-- 0,01° de latitude ≈ 1,11 km. « Comptoir » n'en a aucune.
insert into public.restaurants (name, cuisine_type, city, price_level, tags, location)
values
  ('Zzfiltre Cantine',  'Végétarien', 'Paris', 1, array['vegan', 'vegetarian'],
   '{"lat": 48.8566, "lng": 2.3522}'::jsonb),
  ('Zzfiltre Bistrot',  'Français',   'Paris', 2, array['halal', 'vegetarian'],
   '{"lat": 48.8666, "lng": 2.3522}'::jsonb),
  ('Zzfiltre Table',    'Gastro',     'Paris', 4, '{}'::text[],
   '{"lat": 48.9066, "lng": 2.3522}'::jsonb),
  ('Zzfiltre Comptoir', 'Libanais',   'Paris', null, array['halal', 'vegan'],
   null);

-- ============================================================
-- 1. Distance : haversine sur le point stocké
-- ============================================================
do $$
declare
  v_km double precision;
begin
  raise notice '1. distance';

  v_km := public.geo_distance_km('{"lat": 48.8666, "lng": 2.3522}'::jsonb, 48.8566, 2.3522);
  perform pg_temp.assert(v_km between 1.0 and 1.2, '0,01° de latitude ≈ 1,11 km');

  perform pg_temp.assert(
    public.geo_distance_km(null, 48.8566, 2.3522) is null,
    'sans point, pas de distance'
  );
  perform pg_temp.assert(
    public.geo_distance_km('{"lat": "ici"}'::jsonb, 48.8566, 2.3522) is null,
    'un point mal formé ne vaut pas zéro kilomètre'
  );
  perform pg_temp.assert(
    public.geo_distance_km('{"lat": 48.8566, "lng": 2.3522}'::jsonb, null, null) is null,
    'sans position de référence, pas de distance'
  );
end;
$$;

-- ============================================================
-- 2. Régimes : liste blanche et normalisation
-- ============================================================
do $$
declare
  v_err text;
begin
  raise notice '2. régimes';

  perform pg_temp.assert(
    public.normalize_restaurant_tags(array['vegan', 'vegan', 'pizza', null])
      = array['vegan'],
    'dédoublonne, trie et jette l''inconnu'
  );
  perform pg_temp.assert(
    public.normalize_restaurant_tags(null) = '{}'::text[],
    'aucun régime = tableau vide, jamais null'
  );
  perform pg_temp.assert(
    public.is_restaurant_tags(array['halal', 'vegan']) and
    not public.is_restaurant_tags(array['pizza']) and
    not public.is_restaurant_tags(array['vegan', null]),
    'la liste blanche fait foi'
  );

  v_err := pg_temp.error_of(
    $sql$update public.restaurants set tags = array['pizza'] where name = 'Zzfiltre Cantine'$sql$
  );
  perform pg_temp.assert(
    v_err is not null,
    'la contrainte CHECK refuse un régime inventé, même en écriture directe'
  );
end;
$$;

-- ============================================================
-- 3. Budget : un budget inconnu n'est pas un budget modeste
-- ============================================================
do $$
begin
  raise notice '3. budget';

  perform pg_temp.assert(
    pg_temp.found() @> array['Zzfiltre Bistrot', 'Zzfiltre Cantine',
                             'Zzfiltre Comptoir', 'Zzfiltre Table']
      and cardinality(pg_temp.found()) = 4,
    'sans filtre, les quatre restos du scénario'
  );

  perform pg_temp.assert(
    pg_temp.found(p_price_max => 2::smallint)
      = array['Zzfiltre Bistrot', 'Zzfiltre Cantine'],
    '« ≤ €€ » garde 1 et 2, écarte 4 et le budget inconnu'
  );

  perform pg_temp.assert(
    pg_temp.found(p_price_max => 1::smallint) = array['Zzfiltre Cantine'],
    '« ≤ € » ne garde que le moins cher'
  );
end;
$$;

-- ============================================================
-- 4. Régimes : tous les régimes demandés, pas seulement l'un d'eux
-- ============================================================
do $$
begin
  raise notice '4. filtre régime';

  perform pg_temp.assert(
    pg_temp.found(p_tags => array['vegan'])
      = array['Zzfiltre Cantine', 'Zzfiltre Comptoir'],
    'vegan : les deux qui le servent'
  );

  perform pg_temp.assert(
    pg_temp.found(p_tags => array['vegan', 'halal']) = array['Zzfiltre Comptoir'],
    'vegan ET halal : le seul qui tienne les deux'
  );

  perform pg_temp.assert(
    pg_temp.found(p_tags => array['kosher']) = '{}'::text[],
    'un régime que personne ne sert ne rend rien — pas tout le catalogue'
  );
end;
$$;

-- ============================================================
-- 5. Distance : rayon, tri par proximité, point manquant écarté
-- ============================================================
do $$
begin
  raise notice '5. filtre distance';

  perform pg_temp.assert(
    pg_temp.found(p_lat => 48.8566, p_lng => 2.3522, p_within_km => 2)
      = array['Zzfiltre Cantine', 'Zzfiltre Bistrot'],
    '2 km : du plus proche au plus loin'
  );

  perform pg_temp.assert(
    pg_temp.found(p_lat => 48.8566, p_lng => 2.3522, p_within_km => 10)
      = array['Zzfiltre Cantine', 'Zzfiltre Bistrot', 'Zzfiltre Table'],
    '10 km : le resto sans coordonnées reste dehors'
  );

  perform pg_temp.assert(
    cardinality(pg_temp.found(p_within_km => 2)) = 4,
    'un rayon sans position ne filtre rien'
  );
end;
$$;

-- ============================================================
-- 6. Combinaison et pagination
-- ============================================================
do $$
declare
  v_page1 text[];
  v_page2 text[];
begin
  raise notice '6. combinaison et pagination';

  perform pg_temp.assert(
    pg_temp.found(
      p_price_max => 2::smallint,
      p_tags      => array['vegetarian'],
      p_lat       => 48.8566,
      p_lng       => 2.3522,
      p_within_km => 2
    ) = array['Zzfiltre Cantine', 'Zzfiltre Bistrot'],
    'budget, régime et rayon se combinent'
  );

  v_page1 := pg_temp.found(p_limit => 2, p_offset => 0);
  v_page2 := pg_temp.found(p_limit => 2, p_offset => 2);
  perform pg_temp.assert(
    cardinality(v_page1) = 2 and cardinality(v_page2) = 2
      and not (v_page1 && v_page2)
      and (v_page1 || v_page2) @> array['Zzfiltre Bistrot', 'Zzfiltre Cantine',
                                        'Zzfiltre Comptoir', 'Zzfiltre Table'],
    'deux pages : rien en double, rien d''oublié'
  );

  v_page1 := pg_temp.found(p_tags => array['vegan'], p_limit => 1, p_offset => 0);
  v_page2 := pg_temp.found(p_tags => array['vegan'], p_limit => 1, p_offset => 1);
  perform pg_temp.assert(
    v_page1 = array['Zzfiltre Cantine'] and v_page2 = array['Zzfiltre Comptoir'],
    'la pagination suit le filtre, pas le catalogue entier'
  );
end;
$$;

-- ============================================================
-- 7. Ajout manuel : régimes normalisés, régime inventé refusé
-- ============================================================
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'host', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Hôte"}'::jsonb, true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_restaurant public.restaurants;
  v_err text;
begin
  raise notice '7. ajout manuel';

  v_restaurant := public.create_manual_restaurant(
    'Zzfiltre Manuel', 'Libanais', null, 'Paris', 2::smallint,
    array['vegan', 'vegan', 'halal']
  );
  perform pg_temp.assert(
    v_restaurant.tags = array['halal', 'vegan'],
    'les régimes arrivent en base dédoublonnés et triés'
  );

  v_err := pg_temp.error_of(
    $sql$select public.create_manual_restaurant(
      'Zzfiltre Refusé', null, null, null, null, array['pizza']
    )$sql$
  );
  perform pg_temp.assert(
    v_err like 'omk:invalid_tags%',
    'un régime inventé est refusé avec un code que l''interface sait traduire'
  );
end;
$$;

reset role;

rollback;
