-- ============================================================
-- onmangekoi — ajout manuel d'un restaurant
-- ============================================================
--   * `restaurants.created_by` et `restaurants.source` : on sait qui a ajouté
--     un resto et d'où il vient (`seed`, `manual`, `google`). Les lignes déjà
--     en base sont du seed.
--   * `restaurants.price_level` : budget indicatif de 1 à 4, optionnel.
--   * L'écriture passe par la RPC `create_manual_restaurant` (validation en
--     base, erreurs `omk:*`). Les policies RLS portent la même règle pour
--     toute écriture directe : chacun peut ajouter, seul le créateur modifie.
--   * `find_similar_restaurants` alimente l'avertissement de doublon côté
--     interface — recherche trigram, servie par `idx_restaurants_name_trgm`.
-- ============================================================

-- ─── COLONNES ────────────────────────────────────────────────
alter table public.restaurants
  add column if not exists created_by  uuid references public.profiles (id) on delete set null,
  add column if not exists source      text not null default 'seed',
  add column if not exists price_level smallint;

alter table public.restaurants
  drop constraint if exists restaurants_source_check;
alter table public.restaurants
  add constraint restaurants_source_check
  check (source in ('seed', 'manual', 'google'));

alter table public.restaurants
  drop constraint if exists restaurants_price_level_check;
alter table public.restaurants
  add constraint restaurants_price_level_check
  check (price_level is null or price_level between 1 and 4);

alter table public.restaurants
  drop constraint if exists restaurants_name_length;
alter table public.restaurants
  add constraint restaurants_name_length
  check (char_length(btrim(name)) between 2 and 100);

create index if not exists idx_restaurants_created_by
  on public.restaurants (created_by)
  where created_by is not null;

-- ─── RLS ─────────────────────────────────────────────────────
-- Insertion : tout utilisateur authentifié, mais seulement pour son propre
-- compte et en `manual` (les sources `seed` et `google` restent hors de portée
-- d'une écriture directe — l'import Google passe par sa propre RPC).
create policy "restaurants_insert_authenticated"
  on public.restaurants for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and source = 'manual'
  );

-- Modification : le créateur uniquement, et il ne peut pas se déposséder.
create policy "restaurants_update_creator"
  on public.restaurants for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

grant insert on public.restaurants to authenticated;
grant update (name, cuisine_type, address, city, description, image_url, price_level)
  on public.restaurants to authenticated;

-- ─── RPC : AJOUT MANUEL ──────────────────────────────────────
create or replace function public.create_manual_restaurant(
  p_name        text,
  p_cuisine_type text default null,
  p_address     text default null,
  p_city        text default null,
  p_price_level smallint default null
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

  insert into public.restaurants (
    name, cuisine_type, address, city, price_level, created_by, source
  )
  values (
    v_name,
    nullif(btrim(coalesce(p_cuisine_type, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    p_price_level,
    v_uid,
    'manual'
  )
  returning * into v_restaurant;

  return v_restaurant;
end;
$$;

-- ─── RPC : DOUBLONS PROBABLES ────────────────────────────────
-- Déduplication souple : on n'interdit rien, on prévient. L'opérateur `%`
-- présélectionne via l'index GIN (seuil par défaut 0.3), puis un plancher plus
-- strict écarte les faux voisins : « Le Petit Libanais » vs « Le Petit
-- Brasseur » plafonne à 0.35, alors qu'un vrai doublon dépasse 0.75.
create or replace function public.find_similar_restaurants(p_name text, p_limit int default 3)
  returns setof public.restaurants
  language sql
  stable
  set search_path = ''
as $$
  select r.*
  from public.restaurants r
  where char_length(btrim(coalesce(p_name, ''))) >= 2
    and r.name operator(extensions.%) btrim(p_name)
    and extensions.similarity(r.name, btrim(p_name)) >= 0.45
  order by extensions.similarity(r.name, btrim(p_name)) desc, r.name
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
revoke execute on function public.create_manual_restaurant(text, text, text, text, smallint)
  from public, anon;
grant execute on function public.create_manual_restaurant(text, text, text, text, smallint)
  to authenticated;

revoke execute on function public.find_similar_restaurants(text, int) from public, anon;
grant execute on function public.find_similar_restaurants(text, int) to authenticated;
