-- ============================================================
-- onmangekoi — scénario : accès IA par jeton personnel (serveur MCP)
-- ============================================================
-- Vérifie que :
--   * un jeton se crée connecté, se montre une fois, et n'est stocké que
--     sous forme d'empreinte ;
--   * dix jetons au plus par personne ;
--   * `anon` muni d'un jeton agit au nom de son propriétaire — et de lui
--     seul : ni les listes d'un autre, ni un jeton inventé, ni un jeton
--     révoqué ;
--   * chercher un resto dit dans lesquelles de MES listes il est déjà ;
--   * ranger un resto est idempotent ;
--   * un ajout manuel passe par les mêmes règles que l'app ;
--   * l'export RGPD liste les jetons sans leur empreinte.
--
-- Exécution : bun run db:test (stack locale démarrée).
-- Le script tient dans une transaction terminée par ROLLBACK.
-- ============================================================

\set ON_ERROR_STOP on

\set owner    '31111111-1111-4111-8111-111111111111'
\set outsider '32222222-2222-4222-8222-222222222222'

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

-- Joue une requête et rend le message d'erreur, ou null si elle passe.
create or replace function pg_temp.error_of(p_sql text)
  returns text
  language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;

-- ─── FIXTURES ────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'owner', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Gourmande"}'::jsonb, true),
  (:'outsider', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Voisin"}'::jsonb, true);

insert into public.restaurants (id, name, city, cuisine_type)
values
  ('a1111111-1111-4111-8111-111111111111', 'La Ba', 'Paris', 'Vietnamien'),
  ('a2222222-2222-4222-8222-222222222222', 'La Baraka', 'Paris', 'Marocain');

insert into public.lists (id, name, owner_id)
values
  ('b1111111-1111-4111-8111-111111111111', 'Mes adresses', :'owner'),
  ('b2222222-2222-4222-8222-222222222222', 'Liste du voisin', :'outsider');

insert into public.list_restaurants (list_id, restaurant_id)
values ('b1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222');

create temporary table t_token (label text primary key, token text not null);
grant all on t_token to authenticated, anon;

-- ─── CRÉATION ────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);

insert into t_token select 'owner', token from public.create_api_token('Claude');

select pg_temp.assert(
  (select token ~ '^omk_[0-9a-f]{48}$' from t_token where label = 'owner'),
  'le jeton a la forme omk_ + 48 caractères hexadécimaux'
);

select pg_temp.assert(
  (select count(*) = 1 and bool_and(label = 'Claude') from public.api_tokens),
  'sa propriétaire voit son jeton et son nom'
);

select pg_temp.assert(
  pg_temp.error_of('select token_hash from public.api_tokens') is not null,
  'l''empreinte n''est pas lisible, même par la propriétaire'
);

select pg_temp.assert(
  pg_temp.error_of('select public.mcp_act_as((select token from t_token))') is not null,
  'la résolution du jeton n''est pas appelable directement'
);

-- Dix jetons au plus.
select public.create_api_token('extra ' || n) from generate_series(1, 9) n;
select pg_temp.assert(
  pg_temp.error_of('select public.create_api_token(''un de trop'')') like 'omk:too_many_api_tokens%',
  'un onzième jeton est refusé'
);
delete from public.api_tokens where label like 'extra %';

reset role;

select pg_temp.assert(
  (select token_hash = encode(extensions.digest(t.token, 'sha256'), 'hex')
     from public.api_tokens a, t_token t
    where t.label = 'owner' and a.owner_id = :'owner'),
  'seule l''empreinte SHA-256 est stockée'
);

-- ─── ANON AVEC UN JETON ──────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select pg_temp.assert(
  (select public.mcp_whoami(token) ->> 'pseudo' = 'Gourmande' from t_token),
  'le jeton dit à qui il appartient'
);

select pg_temp.assert(
  (select jsonb_array_length(public.mcp_lists(token)) = 1
      and public.mcp_lists(token) -> 0 ->> 'name' = 'Mes adresses'
     from t_token),
  'mes listes, et seulement les miennes'
);

select pg_temp.assert(
  pg_temp.error_of(
    'select public.mcp_list((select token from t_token), ''b2222222-2222-4222-8222-222222222222'')'
  ) like 'omk:list_not_found%',
  'la liste d''un autre est introuvable'
);

select pg_temp.assert(
  pg_temp.error_of(
    'select public.mcp_add_to_list((select token from t_token), '
    || '''b2222222-2222-4222-8222-222222222222'', ''a1111111-1111-4111-8111-111111111111'')'
  ) like 'omk:list_not_found%',
  'on ne range rien dans la liste d''un autre'
);

select pg_temp.assert(
  pg_temp.error_of('select public.mcp_lists(''omk_' || repeat('0', 48) || ''')')
    like 'omk:invalid_api_token%',
  'un jeton inventé est refusé'
);

select pg_temp.assert(
  pg_temp.error_of('select public.mcp_lists(''pas un jeton'')') like 'omk:invalid_api_token%',
  'une chaîne quelconque aussi'
);

-- Recherche : « la ba » trouve les deux, et sait où est déjà La Baraka.
select pg_temp.assert(
  (select (f -> 0 ->> 'name') = 'La Ba'
      and jsonb_array_length(f -> 0 -> 'in_my_lists') = 0
     from (select public.mcp_find_restaurants(token, 'la ba') f from t_token) s),
  'le nom identique arrive en tête de la recherche'
);

select pg_temp.assert(
  (select exists (
      select 1 from jsonb_array_elements(f) e
       where e ->> 'name' = 'La Baraka'
         and e -> 'in_my_lists' -> 0 ->> 'name' = 'Mes adresses'
    )
     from (select public.mcp_find_restaurants(token, 'la ba') f from t_token) s),
  'la recherche dit dans quelle liste le resto est déjà'
);

-- Ranger : idempotent.
select pg_temp.assert(
  (select (r ->> 'added')::boolean and (r -> 'list' ->> 'restaurant_count')::int = 2
     from (select public.mcp_add_to_list(token, 'b1111111-1111-4111-8111-111111111111',
                                         'a1111111-1111-4111-8111-111111111111') r
             from t_token) s),
  'un resto se range dans ma liste'
);

select pg_temp.assert(
  (select (r ->> 'already_in_list')::boolean and (r -> 'list' ->> 'restaurant_count')::int = 2
     from (select public.mcp_add_to_list(token, 'b1111111-1111-4111-8111-111111111111',
                                         'a1111111-1111-4111-8111-111111111111') r
             from t_token) s),
  'le ranger deux fois ne crée pas de doublon'
);

select pg_temp.assert(
  (select (r ->> 'removed')::boolean
     from (select public.mcp_remove_from_list(token, 'b1111111-1111-4111-8111-111111111111',
                                              'a1111111-1111-4111-8111-111111111111') r
             from t_token) s),
  'un resto se retire de ma liste'
);

-- Créer une liste et un resto.
select pg_temp.assert(
  (select public.mcp_create_list(token, '  Brunchs  ') ->> 'name' = 'Brunchs' from t_token),
  'une liste se crée au nom de la propriétaire du jeton'
);

select pg_temp.assert(
  (select (r ->> 'source') = 'manual' and (r ->> 'city') = 'Lyon'
     from (select public.mcp_create_restaurant(token, 'Chez Odette', 'Bouchon', null, 'Lyon') r
             from t_token) s),
  'un resto ajouté à la main passe par la même fonction que l''app'
);

select pg_temp.assert(
  pg_temp.error_of('select public.mcp_create_restaurant((select token from t_token), ''x'')')
    like 'omk:invalid_restaurant_name%',
  'et par les mêmes règles'
);

reset role;

select pg_temp.assert(
  exists (select 1 from public.lists where name = 'Brunchs' and owner_id = :'owner')
  and exists (
    select 1 from public.restaurants where name = 'Chez Odette' and created_by = :'owner'
  ),
  'tout ce qui est créé l''est au nom de la propriétaire'
);

select pg_temp.assert(
  (select last_used_at is not null from public.api_tokens where owner_id = :'owner'),
  'le jeton note sa dernière utilisation'
);

-- ─── EXPORT RGPD ─────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);

select pg_temp.assert(
  (select e -> 'api_tokens' -> 0 ->> 'label' = 'Claude'
      and not (e -> 'api_tokens' -> 0 ? 'token_hash')
     from (select public.export_my_data() e) s),
  'l''export liste les jetons, sans leur empreinte'
);

-- ─── RÉVOCATION ──────────────────────────────────────────────
delete from public.api_tokens;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select pg_temp.assert(
  pg_temp.error_of('select public.mcp_lists((select token from t_token))')
    like 'omk:invalid_api_token%',
  'un jeton révoqué ne sert plus à rien'
);

reset role;
rollback;
