-- ============================================================
-- onmangekoi — scénario : amorcer le quartier (quota d'import de masse)
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #56, côté base :
--   * le quota est tenu en base, pas dans l'interface : trois amorçages par
--     fenêtre, le quatrième est refusé avec `omk:neighbourhood_quota_reached` ;
--   * `claim_neighbourhood_import()` dit ce qu'il reste après le créneau
--     qu'elle vient de prendre ;
--   * la fenêtre est glissante : un amorçage sorti des 24 h ne compte plus,
--     et sa ligne est purgée au passage ;
--   * le quota est personnel — l'un n'épuise pas celui de l'autre ;
--   * il faut un compte : un appel sans identité est refusé ;
--   * le journal ne se lit ni ne s'écrit directement, la RPC est le seul
--     chemin, et un visiteur anonyme ne peut pas l'appeler.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/neighbourhood-import.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'

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

-- Se met dans la peau d'un utilisateur connecté.
create or replace function pg_temp.act_as(p_uid uuid)
  returns void
  language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

-- Renvoie le code métier `omk:*` levé par une instruction, ou null si elle
-- passe. Une erreur technique remonte telle quelle et fait échouer le script.
create or replace function pg_temp.omk_of(p_sql text)
  returns text
  language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception
  when others then
    if sqlerrm like 'omk:%' then
      return substr(sqlerrm, 5);
    end if;
    raise;
end;
$$;

-- ─── FIXTURES ────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'alice', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Alice"}'::jsonb, true),
  (:'bob', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Bob"}'::jsonb, true);

-- ============================================================
-- 1. Les constantes, telles que l'application les suppose
-- ============================================================
do $$
begin
  raise notice '1. fenêtre et quota';
  perform pg_temp.assert(
    public.neighbourhood_import_quota() = 3,
    'trois amorçages par fenêtre'
  );
  perform pg_temp.assert(
    public.neighbourhood_import_window() = interval '24 hours',
    'la fenêtre glisse sur vingt-quatre heures'
  );
end;
$$;

set local role authenticated;

-- ============================================================
-- 2. Le quota se compte en base, et se dit
-- ============================================================
select pg_temp.act_as(:'alice');

do $$
declare
  v_left integer;
begin
  raise notice '2. le quota d''une personne';

  v_left := public.claim_neighbourhood_import();
  perform pg_temp.assert(v_left = 2, 'le premier amorçage en laisse deux');

  v_left := public.claim_neighbourhood_import();
  perform pg_temp.assert(v_left = 1, 'le deuxième en laisse un');

  v_left := public.claim_neighbourhood_import();
  perform pg_temp.assert(v_left = 0, 'le troisième épuise le compte');

  perform pg_temp.assert(
    pg_temp.omk_of('select public.claim_neighbourhood_import()')
      = 'neighbourhood_quota_reached',
    'le quatrième est refusé, avant tout appel à Google'
  );
end;
$$;

-- ============================================================
-- 3. Chacun son quota
-- ============================================================
select pg_temp.act_as(:'bob');

do $$
begin
  raise notice '3. le quota est personnel';
  perform pg_temp.assert(
    public.claim_neighbourhood_import() = 2,
    'le compte d''Alice n''entame pas celui de Bob'
  );
end;
$$;

-- ============================================================
-- 4. Un amorçage sorti de la fenêtre ne compte plus
-- ============================================================
select set_config('request.jwt.claims', '', true);
reset role;

-- Les trois créneaux d'Alice sont antidatés d'un jour et une heure : hors
-- fenêtre, donc hors du compte — et purgés au premier appel suivant.
update public.neighbourhood_imports
   set claimed_at = now() - interval '25 hours'
 where user_id = :'alice';

set local role authenticated;
select pg_temp.act_as(:'alice');

do $$
begin
  raise notice '4. la fenêtre glisse';
  perform pg_temp.assert(
    public.claim_neighbourhood_import() = 2,
    'le compte repart une fois les amorçages de la veille sortis'
  );
end;
$$;

select set_config('request.jwt.claims', '', true);
reset role;

-- `psql` n'interpole pas ses variables dans un bloc `do $$` : l'assertion se
-- joue donc en SQL simple.
select pg_temp.assert(
  (select count(*) from public.neighbourhood_imports where user_id = :'alice') = 1,
  'les lignes périmées sont purgées, pas gardées'
);

-- ============================================================
-- 5. Il faut un compte
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims', '', true);

do $$
begin
  raise notice '5. sans identité, rien';
  perform pg_temp.assert(
    pg_temp.omk_of('select public.claim_neighbourhood_import()') = 'not_authenticated',
    'un appel sans utilisateur est refusé'
  );
end;
$$;

reset role;

-- ============================================================
-- 6. Le journal ne s'atteint que par la RPC
-- ============================================================
do $$
begin
  raise notice '6. droits';
  perform pg_temp.assert(
    not has_table_privilege('authenticated', 'public.neighbourhood_imports', 'select'),
    'personne ne lit le journal de quota directement'
  );
  perform pg_temp.assert(
    not has_table_privilege('authenticated', 'public.neighbourhood_imports', 'insert'),
    'et personne ne s''y ajoute des créneaux'
  );
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.claim_neighbourhood_import()', 'execute'),
    'un visiteur anonyme n''amorce rien'
  );
  perform pg_temp.assert(
    has_function_privilege('authenticated', 'public.claim_neighbourhood_import()', 'execute'),
    'un compte connecté prend son créneau'
  );
end;
$$;

rollback;
