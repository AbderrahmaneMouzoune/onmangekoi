-- ============================================================
-- onmangekoi — scénario : la liste partagée comme objet public
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #57 :
--   * le partage public est opt-in : une liste est privée par défaut, et le
--     redevient d'un clic — page, contenu et sitemap disparaissent avec elle ;
--   * `public_list` ne dit jamais le propriétaire : ni son pseudo, ni son id,
--     ni l'existence de ses autres listes ;
--   * elle rend ce qui fait une page présentable — nom, compteur, cuisines —
--     et, quand l'historique est là, le restaurant le plus souvent choisi ;
--   * ce palmarès ne compte que les sessions closes du propriétaire, ne
--     retient que les gagnants (score positif) et ne laisse filtrer aucun
--     vote ;
--   * un visiteur anonyme peut appeler ces trois fonctions, et toujours pas
--     lire `lists`.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/public-lists.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set owner    '11111111-1111-4111-8111-111111111111'
\set outsider '22222222-2222-4222-8222-222222222222'

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

-- ─── FIXTURES ────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'owner', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Sam du bureau"}'::jsonb, true),
  (:'outsider', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Passant"}'::jsonb, true);

-- Trois restaurants aux cuisines distinctes : de quoi vérifier que la page
-- annonce ce qu'on y mange sans énumérer les adresses.
create temporary table t_resto as
select row_number() over (order by name) as n, id, name
from public.restaurants
order by name
limit 4;

update public.restaurants r
   set cuisine_type = c.cuisine
  from (
    select t.id, v.cuisine
    from t_resto t
    join (values (1, 'Japonais'), (2, 'Italien'), (3, 'Japonais'), (4, 'Libanais')) as v(n, cuisine)
      on v.n = t.n
  ) c
 where r.id = c.id;

create temporary table t_list (label text primary key, id uuid not null, code text not null);

do $$
declare
  v_public uuid;
  v_secret uuid;
begin
  insert into public.lists (name, owner_id)
  values ('Les restos du bureau', '11111111-1111-4111-8111-111111111111')
  returning id into v_public;

  insert into public.lists (name, owner_id)
  values ('Mes adresses à moi', '11111111-1111-4111-8111-111111111111')
  returning id into v_secret;

  insert into public.list_restaurants (list_id, restaurant_id)
  select v_public, id from t_resto where n in (1, 2, 3);

  insert into public.list_restaurants (list_id, restaurant_id)
  select v_secret, id from t_resto where n = 4;

  insert into t_list (label, id, code)
  select 'public', v_public, share_code from public.lists where id = v_public;
  insert into t_list (label, id, code)
  select 'private', v_secret, share_code from public.lists where id = v_secret;
end;
$$;

grant select on t_resto to anon, authenticated;
grant select on t_list to anon, authenticated;

/*
 * Une session close du host donné, avec un vote par restaurant : un vote
 * suffit à poser un score, et c'est tout ce que le classement regarde.
 */
create or replace function pg_temp.seed_session(
  p_name text,
  p_host uuid,
  p_restaurants uuid[],
  p_values smallint[]
)
  returns uuid
  language plpgsql
as $$
declare
  v_session uuid;
  v_voter uuid;
  v_session_restaurant uuid;
  v_i int;
begin
  insert into public.sessions (name, host_id, status, launched_at, closed_at)
  values (p_name, p_host, 'closed', now() - interval '2 hours', now() - interval '1 hour')
  returning id into v_session;

  insert into public.session_participants (session_id, profile_id)
  values (v_session, p_host)
  returning id into v_voter;

  for v_i in 1 .. array_length(p_restaurants, 1) loop
    insert into public.session_restaurants (session_id, restaurant_id, position)
    values (v_session, p_restaurants[v_i], v_i - 1)
    returning id into v_session_restaurant;

    if p_values[v_i] is not null then
      insert into public.votes (session_id, participant_id, session_restaurant_id, value)
      values (v_session, v_voter, v_session_restaurant, p_values[v_i]);
    end if;
  end loop;

  return v_session;
end;
$$;

do $$
declare
  r uuid[] := (select array_agg(id order by n) from t_resto);
  v_owner uuid := '11111111-1111-4111-8111-111111111111';
  v_outsider uuid := '22222222-2222-4222-8222-222222222222';
begin
  -- Deux déjeuners du bureau : le 1 l'emporte à chaque fois.
  perform pg_temp.seed_session('Déj de lundi', v_owner, array[r[1], r[2]], array[2, 1]::smallint[]);
  perform pg_temp.seed_session('Déj de mardi', v_owner, array[r[1], r[3]], array[1, 0]::smallint[]);
  -- Le 2 gagne une fois : derrière le 1, il ne prend pas la tête.
  perform pg_temp.seed_session('Déj de jeudi', v_owner, array[r[2], r[3]], array[2, 0]::smallint[]);
  -- Personne n'a dit oui : pas de gagnant, même pas le moins mauvais.
  perform pg_temp.seed_session('Sans envie', v_owner, array[r[3]], array[0]::smallint[]);
  -- Chez les voisins : le 3 gagne dix fois, ça ne regarde pas cette liste.
  for i in 1 .. 10 loop
    perform pg_temp.seed_session('Chez les voisins', v_outsider, array[r[3]], array[2]::smallint[]);
  end loop;
end;
$$;

-- ============================================================
-- 1. Privée par défaut
-- ============================================================
do $$
declare
  v_code text := (select code from t_list where label = 'public');
begin
  raise notice '1. privée par défaut';

  perform pg_temp.assert(
    not (select is_public from public.lists where id = (select id from t_list where label = 'public')),
    'une liste naît privée'
  );
  perform pg_temp.assert(
    (select count(*) from public.public_list(v_code)) = 0,
    'tant qu''elle l''est, la page publique ne trouve rien'
  );
  perform pg_temp.assert(
    (select count(*) from public.public_list_restaurants(v_code)) = 0,
    'ni son contenu'
  );
  perform pg_temp.assert(
    (select count(*) from public.public_lists()) = 0,
    'et le sitemap reste vide'
  );
  perform pg_temp.assert(
    (select count(*) from public.list_by_share_token(v_code)) = 1,
    'le lien de partage, lui, continue de fonctionner'
  );
end;
$$;

-- ============================================================
-- 2. Ce que le propriétaire publie
-- ============================================================
update public.lists set is_public = true where id = (select id from t_list where label = 'public');

do $$
declare
  v_code text := (select code from t_list where label = 'public');
  v_row record;
begin
  raise notice '2. la carte de visite';

  select * into v_row from public.public_list(v_code);

  perform pg_temp.assert(v_row.name = 'Les restos du bureau', 'la page porte le nom de la liste');
  perform pg_temp.assert(v_row.restaurant_count = 3, 'et son nombre d''adresses');
  perform pg_temp.assert(
    v_row.cuisines = array['Italien', 'Japonais'],
    'les cuisines représentées, dédoublonnées'
  );
  perform pg_temp.assert(
    v_row.share_code = v_code,
    'le code rendu est la forme canonique du lien'
  );

  perform pg_temp.assert(
    (select count(*) from public.public_list_restaurants(v_code)) = 3,
    'le contenu de la liste est visible'
  );
  perform pg_temp.assert(
    (select array_agg(l.share_code) from public.public_lists() l) = array[v_code],
    'et la liste entre dans le sitemap — seule, les privées n''y sont pas'
  );
end;
$$;

-- ============================================================
-- 3. Le plus souvent choisi
-- ============================================================
do $$
declare
  v_code text := (select code from t_list where label = 'public');
  v_row record;
  r uuid[] := (select array_agg(id order by n) from t_resto);
begin
  raise notice '3. le palmarès';

  select * into v_row from public.public_list(v_code);

  perform pg_temp.assert(
    v_row.top_restaurant = (select name from t_resto where n = 1),
    'le restaurant sorti premier le plus souvent est en tête'
  );
  perform pg_temp.assert(v_row.top_restaurant_wins = 2, 'avec son nombre de sacres');
  perform pg_temp.assert(
    v_row.top_restaurant <> (select name from t_resto where n = 3),
    'les sessions d''un autre groupe ne comptent pas, même à dix victoires'
  );
end;
$$;

-- Une liste dont aucun restaurant n'a jamais gagné n'invente pas de palmarès.
update public.lists set is_public = true where id = (select id from t_list where label = 'private');

do $$
declare
  v_row record;
begin
  select * into v_row from public.public_list((select code from t_list where label = 'private'));

  perform pg_temp.assert(v_row.top_restaurant is null, 'sans historique, pas de plus souvent choisi');
  perform pg_temp.assert(v_row.top_restaurant_wins is null, 'ni de compteur');
  perform pg_temp.assert(v_row.restaurant_count = 1, 'le reste de la carte tient quand même');
end;
$$;

update public.lists set is_public = false where id = (select id from t_list where label = 'private');

-- ============================================================
-- 4. Le propriétaire reste hors de la page
-- ============================================================
do $$
declare
  v_code text := (select code from t_list where label = 'public');
  v_result text := pg_get_function_result(to_regprocedure('public.public_list(text)'));
begin
  raise notice '4. aucun propriétaire';

  perform pg_temp.assert(
    v_result not ilike '%owner%' and v_result not ilike '%pseudo%',
    'la signature ne porte ni pseudo, ni owner_id : rien à filtrer côté application'
  );
  perform pg_temp.assert(
    not exists (
      select 1 from public.public_list(v_code) pl
      where pl.name ilike '%Sam%' or pl.top_restaurant ilike '%Sam%'
    ),
    'et rien de ce qui sort ne porte le pseudo du propriétaire'
  );
  perform pg_temp.assert(
    (select count(*) from public.public_lists()) = 1,
    'ses autres listes restent invisibles — une seule est publique'
  );
end;
$$;

-- ============================================================
-- 5. Le point de vue d'un visiteur anonyme
-- ============================================================
set local role anon;

do $$
declare
  v_code text := (select code from t_list where label = 'public');
begin
  raise notice '5. le visiteur sans compte';

  perform pg_temp.assert(
    (select count(*) from public.public_list(v_code)) = 1,
    'il ouvre la page publique sans pseudo'
  );
  perform pg_temp.assert(
    (select count(*) from public.public_list_restaurants(v_code)) = 3,
    'et en voit le contenu'
  );

  -- `lists` n'est pas seulement filtrée par la RLS : le privilège lui-même
  -- est révoqué pour `anon`. La lecture directe ne rend pas zéro ligne, elle
  -- est refusée.
  begin
    perform 1 from public.lists;
    perform pg_temp.assert(false, 'la table `lists` ne devrait pas lui être lisible');
  exception
    when insufficient_privilege then
      perform pg_temp.assert(true, 'mais la table `lists` lui reste fermée');
  end;
end;
$$;

reset role;

-- ============================================================
-- 6. Repassée en privé, la page se referme
-- ============================================================
update public.lists set is_public = false where id = (select id from t_list where label = 'public');

do $$
declare
  v_code text := (select code from t_list where label = 'public');
begin
  raise notice '6. le retour au privé';

  perform pg_temp.assert(
    (select count(*) from public.public_list(v_code)) = 0,
    'la carte de visite disparaît'
  );
  perform pg_temp.assert(
    (select count(*) from public.public_list_restaurants(v_code)) = 0,
    'le contenu aussi'
  );
  perform pg_temp.assert(
    (select count(*) from public.public_lists()) = 0,
    'et le sitemap n''en parle plus'
  );
  perform pg_temp.assert(
    (select count(*) from public.list_by_share_token(v_code)) = 1,
    'le lien de partage, lui, marche toujours : on n''a fermé que la vitrine'
  );
end;
$$;

-- ============================================================
-- 7. Droits d'exécution
-- ============================================================
do $$
begin
  raise notice '7. droits';

  perform pg_temp.assert(
    has_function_privilege('anon', 'public.public_list(text)', 'execute')
      and has_function_privilege('anon', 'public.public_list_restaurants(text)', 'execute')
      and has_function_privilege('anon', 'public.public_lists()', 'execute'),
    'les trois lectures publiques sont ouvertes au visiteur anonyme'
  );
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.find_list_by_share(text)', 'execute'),
    'la résolution brute d''une liste, elle, reste interne'
  );
end;
$$;

rollback;
