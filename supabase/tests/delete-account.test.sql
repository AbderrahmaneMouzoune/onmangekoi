-- ============================================================
-- onmangekoi — scénario : suppression de compte et export (RGPD)
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #21 :
--   * les résultats d'une session close survivent à la suppression de l'un
--     de ses votants (votes conservés, auteur anonymisé) ;
--   * une session que le compte supprimé hébergeait sans l'avoir close
--     disparaît au lieu de rester gelée ;
--   * une session en cours dont il ne reste que des votants ayant terminé
--     se clôture d'elle-même ;
--   * l'export ne contient que les données de son appelant.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/delete-account.test.sql
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

-- ─── FIXTURES ────────────────────────────────────────────────
-- alice sera supprimée ; bob et carol servent de témoins.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  (:'alice', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@example.test', '{"pseudo":"Alice"}'::jsonb),
  (:'bob', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bob@example.test', '{"pseudo":"Bob"}'::jsonb),
  (:'carol', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'carol@example.test', '{"pseudo":"Carol"}'::jsonb);

-- Deux restaurants du seed suffisent.
create temporary table t_resto as
select id, (row_number() over (order by name))::int as position
from (select id, name from public.restaurants order by name limit 2) s;

create temporary table t_sessions (label text primary key, id uuid not null);

-- Session close : alice héberge, alice et bob ont voté. C'est celle dont les
-- résultats doivent rester intacts.
with s as (
  insert into public.sessions (name, host_id, status, launched_at, closed_at)
  values ('Midi de mardi', :'alice', 'closed', now(), now())
  returning id
)
insert into t_sessions (label, id) select 'closed', id from s;

-- Session en attente hébergée par alice : sans host elle ne peut plus être
-- lancée, elle doit donc disparaître.
with s as (
  insert into public.sessions (name, host_id, status)
  values ('Jamais lancée', :'alice', 'waiting')
  returning id
)
insert into t_sessions (label, id) select 'waiting', id from s;

-- Session en cours hébergée par carol : carol a fini, alice non. Le départ
-- d'alice doit déclencher la clôture au lieu de geler la session.
with s as (
  insert into public.sessions (name, host_id, status, launched_at)
  values ('Vote en cours', :'carol', 'voting', now())
  returning id
)
insert into t_sessions (label, id) select 'voting', id from s;

insert into public.session_restaurants (session_id, restaurant_id, position)
select s.id, r.id, r.position from t_sessions s, t_resto r;

insert into public.session_participants (session_id, profile_id, has_finished_voting)
select s.id, u.profile_id, u.finished
from t_sessions s
join (values
  ('closed',  :'alice'::uuid, true),
  ('closed',  :'bob'::uuid,   true),
  ('waiting', :'alice'::uuid, false),
  ('waiting', :'carol'::uuid, false),
  ('voting',  :'alice'::uuid, false),
  ('voting',  :'carol'::uuid, true)
) as u(label, profile_id, finished) on u.label = s.label;

-- alice : coup de cœur (2) sur le premier, bof (0) sur le second.
-- bob : ça me va (1) sur les deux. Score attendu : 3 puis 1.
insert into public.votes (session_id, participant_id, session_restaurant_id, value)
select sp.session_id, sp.id, sr.id,
  case when sp.profile_id = :'alice'::uuid
    then (case when sr.position = 1 then 2 else 0 end)
    else 1
  end
from public.session_participants sp
join t_sessions t on t.id = sp.session_id and t.label = 'closed'
join public.session_restaurants sr on sr.session_id = sp.session_id;

-- Une liste avec son contenu, appartenant à alice.
create temporary table t_list as
with l as (
  insert into public.lists (name, owner_id) values ('Restos du bureau', :'alice') returning id
)
select id from l;

insert into public.list_restaurants (list_id, restaurant_id)
select l.id, r.id from t_list l, t_resto r;

-- Classement de référence, capturé avant toute suppression.
create temporary table t_before as
select sr.id as session_restaurant_id, coalesce(sum(v.value), 0)::int as score
from public.session_restaurants sr
join t_sessions t on t.id = sr.session_id and t.label = 'closed'
left join public.votes v on v.session_restaurant_id = sr.id
group by sr.id;

select pg_temp.assert(
  (select count(*) from t_before where score in (3, 1)) = 2,
  'les scores de départ sont bien 3 et 1'
);

-- ─── ACTE : alice supprime son compte ────────────────────────
-- Le rôle est basculé sur `authenticated` : le grant d'exécution fait partie
-- de ce qu'on teste, au même titre que le contenu de la fonction.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'alice' || '","role":"authenticated"}', true);

select public.delete_my_account();

reset role;
select set_config('request.jwt.claims', '', true);

-- ─── LE COMPTE A BIEN DISPARU ────────────────────────────────
select pg_temp.assert(
  not exists (select 1 from auth.users where id = :'alice'),
  'le compte auth est supprimé'
);

select pg_temp.assert(
  not exists (select 1 from public.profiles where id = :'alice'),
  'le profil est supprimé'
);

select pg_temp.assert(
  not exists (select 1 from public.lists where owner_id = :'alice'),
  'les listes sont supprimées'
);

select pg_temp.assert(
  not exists (select 1 from public.list_restaurants lr join t_list l on l.id = lr.list_id),
  'le contenu des listes part par cascade'
);

select pg_temp.assert(
  exists (select 1 from auth.users where id = :'bob'),
  'les autres comptes sont intacts'
);

-- ─── LA SESSION CLOSE RESTE COHÉRENTE ────────────────────────
select pg_temp.assert(
  (select s.host_id is null and s.status = 'closed'
   from public.sessions s join t_sessions t on t.id = s.id where t.label = 'closed'),
  'la session close survit à son host, orpheline mais toujours close'
);

select pg_temp.assert(
  (select count(*) from public.session_participants sp
   join t_sessions t on t.id = sp.session_id where t.label = 'closed') = 2,
  'les deux participants de la session close sont conservés'
);

select pg_temp.assert(
  (select count(*) from public.session_participants sp
   join t_sessions t on t.id = sp.session_id
   where t.label = 'closed' and sp.profile_id is null) = 1,
  'le votant supprimé est anonymisé (profile_id null)'
);

select pg_temp.assert(
  (select count(*) from public.votes v
   join t_sessions t on t.id = v.session_id where t.label = 'closed') = 4,
  'les quatre votes de la session close sont conservés'
);

select pg_temp.assert(
  not exists (
    select 1
    from t_before b
    join public.session_restaurants sr on sr.id = b.session_restaurant_id
    left join public.votes v on v.session_restaurant_id = sr.id
    group by b.session_restaurant_id, b.score
    having coalesce(sum(v.value), 0)::int <> b.score
  ),
  'le classement agrégé est identique avant et après'
);

-- Vue applicative : bob relit la salle et les résultats sous RLS.
grant select on t_sessions to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'bob' || '","role":"authenticated"}', true);

create temporary table t_seen as
select sp.profile_id
from public.session_participants sp
join t_sessions t on t.id = sp.session_id
where t.label = 'closed';

reset role;

select pg_temp.assert(
  (select count(*) from t_seen) = 2 and (select count(*) from t_seen where profile_id is null) = 1,
  'un co-participant voit encore la ligne anonymisée (RLS)'
);

create temporary table t_results as
select * from public.session_results((select id from t_sessions where label = 'closed'));

select set_config('request.jwt.claims', '', true);

select pg_temp.assert(
  (select count(*) from t_results) = 2,
  'session_results renvoie toujours les deux restaurants'
);

select pg_temp.assert(
  (select sum(votes_count) from t_results) = 4,
  'session_results compte toujours les quatre votes'
);

select pg_temp.assert(
  (select score from t_results order by rank limit 1) = 3,
  'le vainqueur garde son score malgré la suppression de son votant'
);

-- ─── LES SESSIONS EN SUSPENS SONT TRAITÉES ───────────────────
select pg_temp.assert(
  not exists (select 1 from public.sessions s join t_sessions t on t.id = s.id where t.label = 'waiting'),
  'la session en attente hébergée par le compte supprimé est supprimée'
);

select pg_temp.assert(
  (select count(*) from public.session_participants sp
   join t_sessions t on t.id = sp.session_id where t.label = 'voting') = 1,
  'la participation en cours est supprimée, pas anonymisée'
);

select pg_temp.assert(
  (select s.status = 'closed' and s.closed_at is not null
   from public.sessions s join t_sessions t on t.id = s.id where t.label = 'voting'),
  'la session en cours se clôture au lieu de rester gelée'
);

-- ─── L'EXPORT NE SORT PAS DE SON PÉRIMÈTRE ───────────────────
select pg_temp.assert(
  has_function_privilege('authenticated', 'public.export_my_data()', 'execute')
    and not has_function_privilege('anon', 'public.export_my_data()', 'execute'),
  'l’export est ouvert aux comptes connectés et fermé aux anonymes'
);

select set_config('request.jwt.claims', '{"sub":"' || :'carol' || '","role":"authenticated"}', true);

create temporary table t_export as select public.export_my_data() as payload;

select set_config('request.jwt.claims', '', true);

select pg_temp.assert(
  (select payload -> 'account' ->> 'id' from t_export) = :'carol',
  'l’export porte bien l’identité de son appelant'
);

select pg_temp.assert(
  (select payload -> 'account' ->> 'email' from t_export) = 'carol@example.test',
  'l’export contient l’email du compte'
);

select pg_temp.assert(
  (select jsonb_array_length(payload -> 'participations') from t_export) = 1,
  'l’export ne liste que les participations de son appelant'
);

select pg_temp.assert(
  (select jsonb_array_length(payload -> 'hosted_sessions') from t_export) = 1,
  'l’export ne liste que les sessions hébergées par son appelant'
);

select pg_temp.assert(
  (select payload::text not like '%Restos du bureau%' from t_export),
  'l’export ne contient pas les listes d’un autre compte'
);

select pg_temp.assert(
  (select payload::text not like '%Midi de mardi%' from t_export),
  'l’export ne contient pas les sessions auxquelles l’appelant n’a pas pris part'
);

rollback;
