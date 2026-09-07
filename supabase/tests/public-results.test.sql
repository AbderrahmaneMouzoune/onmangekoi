-- ============================================================
-- onmangekoi — scénario : partage public du classement
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #19 :
--   * le partage est opt-in : tant que le host ne l'a pas ouvert, le lien
--     public ne renvoie rien, même avec le bon code ;
--   * seul le host peut l'ouvrir, et seulement sur une session close ;
--   * une fois ouvert, `anon` ne voit que le podium (3 lignes au plus), le
--     nom de la session et le nombre de participants — aucun pseudo ;
--   * refermer le partage referme la porte immédiatement ;
--   * `anon` ne gagne aucun accès aux tables de session pour autant.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/public-results.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'
\set carol '33333333-3333-4333-8333-333333333333'

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

-- Renvoie le message d'erreur d'une instruction, ou null si elle a réussi :
-- c'est ce qui permet d'affirmer *quelle* règle métier a parlé.
create or replace function pg_temp.error_of(p_sql text)
  returns text
  language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception
  when others then
    return sqlerrm;
end;
$$;

-- Nombre de lignes qu'une table laisse voir au rôle courant. Un refus de
-- droit vaut zéro : les deux disent la même chose — on ne voit rien.
create or replace function pg_temp.visible_rows(p_relation text)
  returns int
  language plpgsql
as $$
declare
  v_count int;
begin
  execute format('select count(*)::int from %s', p_relation) into v_count;
  return v_count;
exception
  when insufficient_privilege then
    return 0;
end;
$$;

-- ─── FIXTURES ────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  (:'alice', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@example.test', '{"pseudo":"Alice"}'::jsonb),
  (:'bob', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bob@example.test', '{"pseudo":"Bob"}'::jsonb),
  (:'carol', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'carol@example.test', '{"pseudo":"Carol"}'::jsonb);

-- Quatre restaurants : il en faut plus de trois pour prouver que le podium
-- s'arrête bien au troisième.
create temporary table t_resto as
select id, (row_number() over (order by name))::int as position
from (select id, name from public.restaurants order by name limit 4) s;

-- Session close, hébergée par alice, où alice, bob et carol ont voté.
create temporary table t_ctx as
with s as (
  insert into public.sessions (name, host_id, status, launched_at, closed_at)
  values ('Vendredi midi', :'alice', 'closed', now(), now())
  returning id, results_code, results_public
)
select * from s;

-- Session encore en cours, même host : un classement qui n'existe pas ne se
-- publie pas.
create temporary table t_voting as
with s as (
  insert into public.sessions (name, host_id, status, launched_at)
  values ('Vote en cours', :'alice', 'voting', now())
  returning id
)
select * from s;

insert into public.session_restaurants (session_id, restaurant_id, position)
select c.id, r.id, r.position from t_ctx c, t_resto r;

insert into public.session_participants (session_id, profile_id, has_finished_voting)
select c.id, u.profile_id, true
from t_ctx c, (values (:'alice'::uuid), (:'bob'::uuid), (:'carol'::uuid)) as u(profile_id);

-- Scores voulus, du premier au dernier : 4, 2, 1 puis −2. Quatre rangs
-- distincts, donc un podium sans égalité à trancher.
insert into public.votes (session_id, participant_id, session_restaurant_id, value)
select sp.session_id, sp.id, sr.id,
  case sr.position
    when 1 then (case when sp.profile_id = :'alice'::uuid then 2 else 1 end)
    when 2 then (case when sp.profile_id = :'carol'::uuid then 0 else 1 end)
    when 3 then (case when sp.profile_id = :'bob'::uuid then 1 else 0 end)
    else (case when sp.profile_id = :'carol'::uuid then -2 else 0 end)
  end
from public.session_participants sp
join t_ctx c on c.id = sp.session_id
join public.session_restaurants sr on sr.session_id = sp.session_id;

grant select on t_ctx to anon, authenticated;
grant select on t_voting to authenticated;

-- ─── LE CODE EXISTE, LE PARTAGE NON ──────────────────────────
select pg_temp.assert(
  (select results_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$' from t_ctx),
  'la session reçoit un code de classement Crockford de 10 symboles'
);

select pg_temp.assert(
  (select results_public is false from t_ctx),
  'le partage est fermé par défaut'
);

set local role anon;
select pg_temp.assert(
  (select count(*) from public.public_results((select results_code from t_ctx))) = 0,
  'avec le bon code mais sans opt-in, le lien public ne renvoie rien'
);
reset role;

-- ─── SEUL LE HOST OUVRE LE PARTAGE ───────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'bob' || '","role":"authenticated"}', true);

select pg_temp.assert(
  pg_temp.error_of(
    'select public.set_results_public((select id from t_ctx), true)'
  ) like '%omk:host_only%',
  'un participant qui n’est pas host ne peut pas publier le classement'
);

select set_config('request.jwt.claims', '{"sub":"' || :'alice' || '","role":"authenticated"}', true);

select pg_temp.assert(
  pg_temp.error_of(
    'select public.set_results_public((select id from t_voting), true)'
  ) like '%omk:session_not_closed%',
  'le host ne peut pas publier le classement d’une session encore en cours'
);

select public.set_results_public((select id from t_ctx), true);
reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.assert(
  (select s.results_public from public.sessions s join t_ctx c on c.id = s.id),
  'le host a ouvert le partage'
);

-- ─── CE QUE VOIT UN INCONNU ──────────────────────────────────
-- Tout ce bloc s'exécute sous le rôle `anon` : c'est le grant d'exécution
-- qu'on éprouve autant que le contenu de la fonction.
set local role anon;

select pg_temp.assert(
  pg_temp.visible_rows('public.sessions') = 0
  and pg_temp.visible_rows('public.session_participants') = 0
  and pg_temp.visible_rows('public.votes') = 0
  and pg_temp.visible_rows('public.profiles') = 0,
  'anon ne lit toujours aucune table de session : la RPC est la seule porte'
);

select pg_temp.assert(
  (select count(*) from public.public_results((select results_code from t_ctx))) = 3,
  'le lien public s’arrête au podium : 3 lignes sur 4 restaurants'
);

-- Saisie tolérante : le lien recopié en minuscules mène au même classement.
select pg_temp.assert(
  (select count(*) from public.public_results(
    (select lower(results_code) from t_ctx))) = 3,
  'le code en minuscules ouvre le même classement'
);

select pg_temp.assert(
  (select count(*) from public.public_results('ZZZZZZZZZZ')) = 0
  and (select count(*) from public.public_results('pas-un-code')) = 0,
  'un code inconnu ou malformé ne renvoie rien'
);

reset role;

create temporary table t_public as
select * from public.public_results((select results_code from t_ctx));

select pg_temp.assert(
  (select array_agg(rank order by rank) from t_public) = array[1, 2, 3],
  'les trois premiers rangs, dans l’ordre'
);

select pg_temp.assert(
  (select score from t_public where rank = 1) = 4
  and (select score from t_public where rank = 2) = 2
  and (select score from t_public where rank = 3) = 1,
  'les scores du podium sont ceux du dépouillement'
);

select pg_temp.assert(
  (select count(distinct participant_count) from t_public) = 1
  and (select max(participant_count) from t_public) = 3
  and (select count(*) from t_public where session_name = 'Vendredi midi') = 3,
  'le nom de la session et le nombre de participants accompagnent le podium'
);

select pg_temp.assert(
  (select votes_count from t_public where rank = 1) = 3,
  'le vainqueur porte son nombre de votes'
);

-- Aucun pseudo ne peut fuiter d'une colonne qui n'existe pas : on fige donc
-- la liste exacte de ce que la RPC est autorisée à renvoyer.
select pg_temp.assert(
  (select array_agg(p.parameter_name::text order by p.ordinal_position)
   from information_schema.routines r
   join information_schema.parameters p on p.specific_name = r.specific_name
   where r.routine_schema = 'public'
     and r.routine_name = 'public_results'
     and p.parameter_mode = 'OUT')
  = array[
      'session_name', 'closed_at', 'participant_count', 'rank', 'restaurant_name',
      'cuisine_type', 'city', 'photo_url', 'score', 'votes_count'
    ],
  'la RPC ne renvoie que le podium et le décompte — aucune colonne de pseudo'
);

-- ─── REFERMER LE PARTAGE ─────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'alice' || '","role":"authenticated"}', true);
select public.set_results_public((select id from t_ctx), false);
reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
select pg_temp.assert(
  (select count(*) from public.public_results((select results_code from t_ctx))) = 0,
  'refermer le partage rend le lien public muet, immédiatement'
);
reset role;

rollback;
