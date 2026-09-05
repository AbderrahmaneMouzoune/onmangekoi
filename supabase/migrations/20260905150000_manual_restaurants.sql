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

-- ─── EXPORT RGPD ─────────────────────────────────────────────
-- `export_my_data` (migration 20260905140000) énumère tout ce qui est rattaché
-- au compte. `restaurants.created_by` crée une catégorie de plus : sans cette
-- redéfinition, un resto ajouté par la personne serait absent de son export.
-- Le corps est repris tel quel, à la clé `contributed_restaurants` près.
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

    -- Restos ajoutés par cette personne (issue #3 / #2) : la ligne reste en
    -- base après suppression du compte — `created_by` est simplement détaché —
    -- mais tant que le compte existe, le lien est une donnée la concernant.
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

    'hosted_sessions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'status', s.status,
          'invite_code', s.invite_code,
          'created_at', s.created_at,
          'launched_at', s.launched_at,
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
