-- ============================================================
-- onmangekoi — import Google Places
-- ============================================================
--   * `restaurants.place_id` identifie un lieu Google de façon stable ;
--     l'index unique garantit qu'un même lieu ne crée jamais de doublon,
--     quel que soit le nombre d'imports concurrents.
--   * `latitude` / `longitude` sont conservées pour un futur biais
--     géographique et pour rouvrir la fiche du lieu.
--   * L'import passe par `upsert_restaurant_from_place`, idempotente :
--     insertion au premier import, rafraîchissement des champs ensuite.
--     Aucune policy RLS n'ouvre l'écriture en `source = 'google'` : cette
--     RPC est le seul chemin.
-- ============================================================

alter table public.restaurants
  add column if not exists place_id  text,
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

-- Un index unique ignore les NULL : les restos hors Google cohabitent sans
-- se marcher dessus, et c'est lui qui porte le `on conflict` de la RPC.
create unique index if not exists restaurants_place_id_key
  on public.restaurants (place_id);

alter table public.restaurants
  drop constraint if exists restaurants_place_id_source_check;
alter table public.restaurants
  add constraint restaurants_place_id_source_check
  check (place_id is null or source = 'google');

-- ─── RPC : IMPORT IDEMPOTENT ─────────────────────────────────
create or replace function public.upsert_restaurant_from_place(
  p_place_id     text,
  p_name         text,
  p_address      text default null,
  p_city         text default null,
  p_cuisine_type text default null,
  p_latitude     double precision default null,
  p_longitude    double precision default null,
  p_price_level  smallint default null
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

  insert into public.restaurants (
    name, cuisine_type, address, city, price_level,
    place_id, latitude, longitude, created_by, source
  )
  values (
    v_name,
    nullif(btrim(coalesce(p_cuisine_type, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    p_price_level,
    v_place_id,
    p_latitude,
    p_longitude,
    v_uid,
    'google'
  )
  on conflict (place_id) do update set
    -- Le lieu est déjà en base : on rafraîchit ce que Google sait de lui,
    -- sans écraser le premier importateur ni perdre une valeur déjà connue.
    name         = excluded.name,
    cuisine_type = coalesce(excluded.cuisine_type, public.restaurants.cuisine_type),
    address      = coalesce(excluded.address, public.restaurants.address),
    city         = coalesce(excluded.city, public.restaurants.city),
    price_level  = coalesce(excluded.price_level, public.restaurants.price_level),
    latitude     = coalesce(excluded.latitude, public.restaurants.latitude),
    longitude    = coalesce(excluded.longitude, public.restaurants.longitude),
    created_by   = coalesce(public.restaurants.created_by, excluded.created_by)
  returning * into v_restaurant;

  return v_restaurant;
end;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
revoke execute on function public.upsert_restaurant_from_place(
  text, text, text, text, text, double precision, double precision, smallint
) from public, anon;
grant execute on function public.upsert_restaurant_from_place(
  text, text, text, text, text, double precision, double precision, smallint
) to authenticated;
