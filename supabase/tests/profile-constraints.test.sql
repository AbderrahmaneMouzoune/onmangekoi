-- ============================================================
-- onmangekoi — scénario : contraintes alimentaires déclarées
-- ============================================================
-- Vérifie les critères de l'issue #60 côté base :
--   * une contrainte n'est lisible et supprimable que par son propriétaire ;
--     l'écriture passe par `save_my_constraints`, qui valide, remplace
--     l'ensemble d'un coup et sait tout retirer ;
--   * `restaurant_conflicts_with` se tait sans `tags` ni `price_level`, et
--     sait qu'un resto vegan sert végétarien ;
--   * `session_constraint_conflicts` ne renvoie qu'un compte par resto, aux
--     seuls participants, et suit les changements de contraintes ;
--   * l'export RGPD liste les contraintes, la suppression du compte les
--     emporte.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/profile-constraints.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set alice 'c1111111-1111-4111-8111-111111111111'
\set bob   'c2222222-2222-4222-8222-222222222222'
\set carol 'c3333333-3333-4333-8333-333333333333'
\set dave  'c4444444-4444-4444-8444-444444444444'

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

-- Joue un bloc sous l'identité d'un utilisateur connecté.
create or replace function pg_temp.login(p_uid uuid)
  returns void
  language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- ─── FIXTURES ────────────────────────────────────────────────
-- alice est végétarienne, bob mange halal et ne dépasse pas €€, carol n'a
-- rien déclaré, dave ne participe pas à la session.
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'alice', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Alice"}'::jsonb, true),
  (:'bob', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Bob"}'::jsonb, true),
  (:'carol', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Carol"}'::jsonb, true),
  (:'dave', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Dave"}'::jsonb, true);

-- Quatre restos taillés pour la règle :
--   green   : vegan, €     — heurte bob (pas halal), pas alice (vegan ⊃ végé)
--   steak   : halal, €€€€  — heurte alice (pas végé) et bob (trop cher)
--   mystere : rien de connu — ne heurte personne, faute de savoir
--   cher    : régimes inconnus, €€€ — heurte bob par le budget seul
create temporary table t_resto (label text primary key, id uuid not null);

with r as (
  insert into public.restaurants (name, tags, price_level, source)
  values
    ('Green Test', '{vegan}', 1, 'seed'),
    ('Steak Test', '{halal}', 4, 'seed'),
    ('Mystère Test', '{}', null, 'seed'),
    ('Cher Test', '{}', 3, 'seed')
  returning id, name
)
insert into t_resto (label, id)
select case name
  when 'Green Test' then 'green'
  when 'Steak Test' then 'steak'
  when 'Mystère Test' then 'mystere'
  else 'cher'
end, id
from r;

create temporary table t_sessions (label text primary key, id uuid not null, code text not null);

grant select on t_resto to authenticated;
grant select, insert on t_sessions to authenticated;

-- ============================================================
-- 1. La règle, seule
-- ============================================================
do $$
begin
  raise notice '1. la règle';
  perform pg_temp.assert(
    not public.restaurant_conflicts_with('{}', null, '{vegan,halal}', 1),
    'sans régimes ni prix connus, la règle se tait'
  );
  perform pg_temp.assert(
    not public.restaurant_conflicts_with('{}', 2, '{halal}', null),
    'des régimes non renseignés ne heurtent aucun régime'
  );
  perform pg_temp.assert(
    public.restaurant_conflicts_with('{vegetarian}', null, '{halal}', null),
    'un régime déclaré qui manque heurte'
  );
  perform pg_temp.assert(
    not public.restaurant_conflicts_with('{vegan}', null, '{vegetarian}', null),
    'un resto vegan sert végétarien'
  );
  perform pg_temp.assert(
    public.restaurant_conflicts_with('{vegetarian}', null, '{vegan}', null),
    'un resto végétarien ne sert pas forcément vegan'
  );
  perform pg_temp.assert(
    public.restaurant_conflicts_with('{halal}', null, '{halal,gluten_free}', null),
    'il suffit d''un régime manquant'
  );
  perform pg_temp.assert(
    public.restaurant_conflicts_with('{}', 3, '{}', 2)
      and not public.restaurant_conflicts_with('{}', 2, '{}', 2),
    'le budget heurte au-dessus du maximum, pas à égalité'
  );
  perform pg_temp.assert(
    not public.restaurant_conflicts_with('{}', null, '{}', 1),
    'un prix inconnu ne heurte aucun budget'
  );
  perform pg_temp.assert(
    not public.restaurant_conflicts_with('{halal}', 4, '{}', null),
    'sans contrainte, rien ne heurte'
  );
end;
$$;

-- ============================================================
-- 2. Écriture : RPC, validation, RLS propriétaire
-- ============================================================
set local role authenticated;
select pg_temp.login(:'alice');

do $$
begin
  raise notice '2. écriture et RLS';

  perform public.save_my_constraints('{vegetarian}', null);
  perform pg_temp.assert(
    (select array_agg(tag) from public.profile_constraints) = '{vegetarian}'
      and not exists (select 1 from public.profile_budgets),
    'alice déclare végétarien, sans budget'
  );

  perform pg_temp.assert(
    pg_temp.error_of($sql$ select public.save_my_constraints('{carnivore}', null) $sql$)
      = 'omk:invalid_tags',
    'un régime inconnu est refusé'
  );
  perform pg_temp.assert(
    pg_temp.error_of($sql$ select public.save_my_constraints('{}', 5::smallint) $sql$)
      = 'omk:invalid_price_level',
    'un budget hors de 1 à 4 est refusé'
  );
  perform pg_temp.assert(
    pg_temp.error_of($sql$ insert into public.profile_constraints (profile_id, tag)
      values (auth.uid(), 'halal') $sql$) is not null,
    'pas d''insertion directe : l''écriture passe par la RPC'
  );
  perform pg_temp.assert(
    pg_temp.error_of($sql$ insert into public.profile_budgets (profile_id, max_price_level)
      values (auth.uid(), 2) $sql$) is not null,
    'pas d''insertion directe du budget non plus'
  );
end;
$$;

select pg_temp.login(:'bob');
-- Doublons et désordre : la RPC normalise.
select public.save_my_constraints('{halal,gluten_free,halal}', 3::smallint);
-- Puis bob se ravise : plus de sans gluten, budget €€. Remplacement entier.
select public.save_my_constraints('{halal}', 2::smallint);

do $$
begin
  perform pg_temp.assert(
    (select array_agg(tag) from public.profile_constraints) = '{halal}'
      and (select max_price_level from public.profile_budgets) = 2,
    'une nouvelle déclaration remplace la précédente'
  );
  perform pg_temp.assert(
    not exists (select 1 from public.profile_constraints
                where profile_id = 'c1111111-1111-4111-8111-111111111111'),
    'les contraintes d''alice sont invisibles pour bob'
  );
  delete from public.profile_constraints;
  delete from public.profile_budgets;
end;
$$;

-- bob n'a pu supprimer que les siennes : on les repose.
select public.save_my_constraints('{halal}', 2::smallint);

reset role;

select pg_temp.assert(
  exists (select 1 from public.profile_constraints where profile_id = :'alice' and tag = 'vegetarian'),
  'ni supprimables par un autre'
);

-- Le budget n'est pas dans `profiles`, lisible par les co-participants.
select pg_temp.assert(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('max_price_level', 'tags')
  ),
  'profiles ne porte aucune contrainte'
);

set local role anon;
select pg_temp.assert(
  pg_temp.error_of($sql$ select public.save_my_constraints('{halal}', null) $sql$) is not null,
  'un visiteur sans compte ne déclare rien'
);
select pg_temp.assert(
  pg_temp.error_of($sql$ select count(*) from public.profile_constraints $sql$) is not null,
  'ni ne lit la table'
);
reset role;

-- ============================================================
-- 3. Agrégat par session : des comptes, aux seuls participants
-- ============================================================
set local role authenticated;
select pg_temp.login(:'alice');

do $$
declare
  v_session public.sessions;
begin
  raise notice '3. agrégat par session';
  v_session := public.create_session(
    'Midi contraint',
    (select array_agg(id order by label) from t_resto)
  );
  insert into t_sessions values ('lunch', v_session.id, v_session.invite_code);
end;
$$;

select pg_temp.login(:'bob');
select public.join_session((select code from t_sessions where label = 'lunch'));
select pg_temp.login(:'carol');
select public.join_session((select code from t_sessions where label = 'lunch'));

-- carol n'a rien déclaré, mais voit le compte de toute la salle.
create temporary table t_counts as
select r.label, c.blocked_count
from public.session_constraint_conflicts((select id from t_sessions where label = 'lunch')) c
join t_resto r on r.id = c.restaurant_id;

do $$
begin
  perform pg_temp.assert(
    (select blocked_count from t_counts where label = 'green') = 1,
    'green : bob seul (pas halal) — alice, végétarienne, y mange vegan'
  );
  perform pg_temp.assert(
    (select blocked_count from t_counts where label = 'steak') = 2,
    'steak : alice (pas végé) et bob (trop cher), comptés une fois chacun'
  );
  perform pg_temp.assert(
    (select blocked_count from t_counts where label = 'cher') = 1,
    'cher : bob, par son budget, alors que ses régimes sont inconnus'
  );
  perform pg_temp.assert(
    not exists (select 1 from t_counts where label = 'mystere'),
    'mystère : rien de connu, rien de signalé'
  );
end;
$$;

reset role;

-- La forme même du résultat : un resto et un nombre, rien qui nomme.
select pg_temp.assert(
  pg_get_function_result('public.session_constraint_conflicts(uuid)'::regprocedure)
    = 'TABLE(restaurant_id uuid, blocked_count integer)',
  'la RPC ne renvoie qu''un identifiant de resto et un compte'
);

set local role authenticated;
select pg_temp.login(:'dave');
select pg_temp.assert(
  pg_temp.error_of(format(
    'select * from public.session_constraint_conflicts(%L)',
    (select id from t_sessions where label = 'lunch')
  )) = 'omk:not_participant',
  'un non-participant n''apprend rien'
);
reset role;

select id as lunch_id from t_sessions where label = 'lunch' \gset

set local role anon;
select pg_temp.assert(
  pg_temp.error_of(format(
    'select * from public.session_constraint_conflicts(%L)', :'lunch_id'
  )) is not null,
  'un visiteur sans compte non plus'
);
reset role;

-- Réversible : bob retire tout. Plus rien ne le compte.
set local role authenticated;
select pg_temp.login(:'bob');
select public.save_my_constraints('{}', null);

do $$
begin
  perform pg_temp.assert(
    not exists (select 1 from public.profile_constraints)
      and not exists (select 1 from public.profile_budgets),
    'tout retirer vide les deux tables'
  );
end;
$$;

create temporary table t_counts_after as
select r.label, c.blocked_count
from public.session_constraint_conflicts((select id from t_sessions where label = 'lunch')) c
join t_resto r on r.id = c.restaurant_id;

do $$
begin
  perform pg_temp.assert(
    (select count(*) from t_counts_after) = 1
      and (select blocked_count from t_counts_after where label = 'steak') = 1,
    'le compte suit : seul steak reste signalé, pour alice'
  );
end;
$$;

-- Un signal, pas un interdit : le host lance quand même.
select pg_temp.login(:'alice');
select public.launch_session((select id from t_sessions where label = 'lunch'));
reset role;

select pg_temp.assert(
  (select status from public.sessions where id = (select id from t_sessions where label = 'lunch'))
    = 'voting',
  'une contrainte ne bloque jamais une session'
);

-- ============================================================
-- 4. RGPD : export et suppression du compte
-- ============================================================
set local role authenticated;
select pg_temp.login(:'carol');

do $$
declare
  v_export jsonb := public.export_my_data();
begin
  raise notice '4. RGPD';
  perform pg_temp.assert(
    v_export -> 'food_constraints' = '{"tags": [], "max_price_level": null}'::jsonb,
    'sans déclaration, l''export le dit'
  );
end;
$$;

select pg_temp.login(:'alice');
select public.save_my_constraints('{vegetarian,gluten_free}', 1::smallint);

do $$
declare
  v_export jsonb := public.export_my_data();
begin
  perform pg_temp.assert(
    v_export -> 'food_constraints'
      = '{"tags": ["gluten_free", "vegetarian"], "max_price_level": 1}'::jsonb,
    'l''export liste les régimes et le budget'
  );
  perform pg_temp.assert(
    v_export ? 'push_subscriptions' and v_export ? 'participations' and v_export ? 'groups',
    'l''export garde tout ce qu''il contenait avant'
  );
  perform public.delete_my_account();
end;
$$;
reset role;

select pg_temp.assert(
  not exists (select 1 from public.profile_constraints where profile_id = :'alice')
    and not exists (select 1 from public.profile_budgets where profile_id = :'alice'),
  'la suppression du compte emporte ses contraintes'
);

rollback;
