-- ============================================================
-- onmangekoi — scénario : groupes récurrents
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #8 :
--   * un groupe se sauvegarde depuis une session vécue, avec ses
--     participants, et pas depuis une session où l'on n'était pas ;
--   * RLS : seuls les membres voient le groupe, seul le propriétaire le
--     renomme ou le supprime ;
--   * inviter un groupe **ne crée pas de participants** : les invités
--     restent en attente, le quorum de lancement ne bouge pas — pas de vote
--     fantôme ;
--   * un invité devient participant en ouvrant la session, et son
--     invitation est consommée à ce moment-là, une seule fois ;
--   * quitter un groupe : permis aux membres, refusé au propriétaire.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/recurring-groups.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set host     '11111111-1111-4111-8111-111111111111'
\set mate     '22222222-2222-4222-8222-222222222222'
\set outsider '33333333-3333-4333-8333-333333333333'

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

-- ─── FIXTURES ────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'host', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Hôte"}'::jsonb, true),
  (:'mate', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Collègue"}'::jsonb, true),
  (:'outsider', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Passant"}'::jsonb, true);

create temporary table t_resto as
select id from (select id, name from public.restaurants order by name limit 2) s;

create temporary table t_sessions (label text primary key, id uuid not null);
create temporary table t_groups (label text primary key, id uuid not null);

-- Les tables de travail appartiennent à `postgres` : sans ce droit, les blocs
-- joués sous le rôle `authenticated` ne les liraient pas.
grant select on t_resto to authenticated;
grant select, insert on t_sessions to authenticated;
grant select, insert on t_groups to authenticated;

-- ============================================================
-- 1. Une première session : le host et son collègue
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_ids uuid[] := (select array_agg(id) from t_resto);
  v_session public.sessions;
begin
  v_session := public.create_session('Midi de mardi', v_ids);
  insert into t_sessions (label, id) values ('first', v_session.id);
end;
$$;

-- Le collègue rejoint. Le code se lit hors RLS : il n'est pas encore
-- participant, donc la session ne lui est pas visible.
reset role;
select s.invite_code as first_code
  from public.sessions s
  join t_sessions t on t.id = s.id
 where t.label = 'first' \gset
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"' || :'mate' || '","role":"authenticated"}', true);
select public.join_session(:'first_code');

-- ============================================================
-- 2. Sauvegarder le groupe depuis la session vécue
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_first uuid := (select id from t_sessions where label = 'first');
  v_group public.groups;
  v_err text;
begin
  raise notice '2. sauvegarde du groupe';

  v_group := public.create_group_from_session('L''équipe du déjeuner', v_first);
  insert into t_groups (label, id) values ('lunch', v_group.id);

  perform pg_temp.assert(v_group.owner_id = (select auth.uid()), 'le créateur est propriétaire');
  perform pg_temp.assert(
    (select count(*) from public.group_members where group_id = v_group.id) = 2,
    'les deux participants de la session deviennent membres'
  );

  v_err := pg_temp.error_of(
    format('select public.create_group_from_session(%L, %L)', 'L''équipe du déjeuner', v_first)
  );
  perform pg_temp.assert(v_err = 'omk:group_name_taken', 'deux groupes du même nom sont refusés');

  v_err := pg_temp.error_of(
    format('select public.create_group_from_session(%L, %L)', '   ', v_first)
  );
  perform pg_temp.assert(v_err = 'omk:invalid_group_name', 'un nom vide est refusé');
end;
$$;

-- Qui n'était pas dans la session ne peut pas en tirer un groupe.
select set_config('request.jwt.claims',
                  '{"sub":"' || :'outsider' || '","role":"authenticated"}', true);

do $$
declare
  v_first uuid := (select id from t_sessions where label = 'first');
  v_err text;
begin
  v_err := pg_temp.error_of(
    format('select public.create_group_from_session(%L, %L)', 'Groupe volé', v_first)
  );
  perform pg_temp.assert(
    v_err = 'omk:not_participant',
    'on ne sauvegarde pas le groupe d''une session qu''on n''a pas vécue'
  );
end;
$$;

-- ============================================================
-- 3. RLS : les membres voient, le propriétaire seul modifie
-- ============================================================
do $$
declare
  v_group uuid := (select id from t_groups where label = 'lunch');
begin
  raise notice '3. RLS des groupes';

  perform pg_temp.assert(
    (select count(*) from public.groups where id = v_group) = 0,
    'un non-membre ne voit pas le groupe'
  );
  perform pg_temp.assert(
    (select count(*) from public.group_members where group_id = v_group) = 0,
    'un non-membre ne voit pas les membres'
  );
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'mate' || '","role":"authenticated"}', true);

do $$
declare
  v_group uuid := (select id from t_groups where label = 'lunch');
  v_renamed int;
  v_deleted int;
begin
  perform pg_temp.assert(
    (select count(*) from public.groups where id = v_group) = 1,
    'un membre voit le groupe'
  );
  perform pg_temp.assert(
    (select count(*) from public.group_members where group_id = v_group) = 2,
    'un membre voit tous les membres'
  );
  perform pg_temp.assert(
    (select count(*) from public.profiles p
      join public.group_members gm on gm.profile_id = p.id
     where gm.group_id = v_group) = 2,
    'un membre lit le pseudo des autres, même hors session'
  );

  with renamed as (
    update public.groups set name = 'Détourné' where id = v_group returning 1
  )
  select count(*) into v_renamed from renamed;
  perform pg_temp.assert(v_renamed = 0, 'un membre ne renomme pas le groupe');

  with removed as (
    delete from public.groups where id = v_group returning 1
  )
  select count(*) into v_deleted from removed;
  perform pg_temp.assert(v_deleted = 0, 'un membre ne supprime pas le groupe');
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_group uuid := (select id from t_groups where label = 'lunch');
  v_renamed int;
begin
  with renamed as (
    update public.groups set name = 'L''équipe du midi' where id = v_group returning 1
  )
  select count(*) into v_renamed from renamed;
  perform pg_temp.assert(v_renamed = 1, 'le propriétaire renomme son groupe');
end;
$$;

-- ============================================================
-- 4. Inviter le groupe : des invitations, pas des participants
-- ============================================================
do $$
declare
  v_ids uuid[] := (select array_agg(id) from t_resto);
  v_group uuid := (select id from t_groups where label = 'lunch');
  v_session public.sessions;
  v_invited integer;
  v_err text;
begin
  raise notice '4. invitation du groupe';

  v_session := public.create_session('Midi de jeudi', v_ids);
  insert into t_sessions (label, id) values ('second', v_session.id);

  v_invited := public.invite_group_to_session(v_group, v_session.id);
  perform pg_temp.assert(v_invited = 1, 'seul le collègue est invité : le host est déjà là');
  perform pg_temp.assert(
    (select count(*) from public.session_participants where session_id = v_session.id) = 1,
    'un invité n''est pas un participant'
  );
  perform pg_temp.assert(
    (select count(*) from public.session_invitations where session_id = v_session.id) = 1,
    'l''invitation est bien posée'
  );

  perform pg_temp.assert(
    public.invite_group_to_session(v_group, v_session.id) = 0,
    'réinviter le même groupe ne double pas les invitations'
  );

  -- Le cœur du critère d'acceptation : sans le collègue arrivé, le vote ne
  -- part pas — l'invitation ne fabrique pas un votant fantôme.
  v_err := pg_temp.error_of(format('select public.launch_session(%L)', v_session.id));
  perform pg_temp.assert(
    v_err = 'omk:not_enough_participants',
    'une invitation en attente ne compte pas dans le quorum de lancement'
  );
end;
$$;

-- Un participant qui n'est pas host ne peut pas inviter.
select set_config('request.jwt.claims', '{"sub":"' || :'mate' || '","role":"authenticated"}', true);

do $$
declare
  v_group uuid := (select id from t_groups where label = 'lunch');
  v_second uuid := (select id from t_sessions where label = 'second');
  v_err text;
begin
  v_err := pg_temp.error_of(
    format('select public.invite_group_to_session(%L, %L)', v_group, v_second)
  );
  perform pg_temp.assert(v_err = 'omk:host_only', 'seul le host invite un groupe');
end;
$$;

-- ============================================================
-- 5. L'invité ouvre la session : il devient participant
-- ============================================================
do $$
declare
  v_second uuid := (select id from t_sessions where label = 'second');
begin
  raise notice '5. l''invité rejoint';

  perform pg_temp.assert(
    (select count(*) from public.my_session_invitations()) = 1,
    'l''invité voit son invitation sans être participant'
  );
  perform pg_temp.assert(
    (select count(*) from public.sessions where id = v_second) = 0,
    'la session elle-même lui reste invisible tant qu''il n''est pas entré'
  );
end;
$$;

reset role;
select s.invite_code as second_code
  from public.sessions s
  join t_sessions t on t.id = s.id
 where t.label = 'second' \gset
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"' || :'mate' || '","role":"authenticated"}', true);
select public.join_session(:'second_code');

do $$
declare
  v_second uuid := (select id from t_sessions where label = 'second');
begin
  perform pg_temp.assert(
    (select count(*) from public.session_participants where session_id = v_second) = 2,
    'ouvrir la session fait du pré-invité un participant'
  );
  perform pg_temp.assert(
    (select count(*) from public.session_invitations where session_id = v_second) = 0,
    'l''invitation est consommée : elle ne traîne pas derrière la participation'
  );
  perform pg_temp.assert(
    (select count(*) from public.my_session_invitations()) = 0,
    'elle disparaît de la liste des invitations en attente'
  );
end;
$$;

-- Le vote peut démarrer : deux participants réellement là.
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_second uuid := (select id from t_sessions where label = 'second');
  v_group uuid := (select id from t_groups where label = 'lunch');
  v_session public.sessions;
  v_err text;
begin
  v_session := public.launch_session(v_second);
  perform pg_temp.assert(v_session.status = 'voting', 'le vote démarre une fois l''invité arrivé');

  v_err := pg_temp.error_of(
    format('select public.invite_group_to_session(%L, %L)', v_group, v_second)
  );
  perform pg_temp.assert(
    v_err = 'omk:session_already_started',
    'on n''invite plus un groupe dans une session lancée'
  );
end;
$$;

-- ============================================================
-- 6. Quitter un groupe
-- ============================================================
do $$
declare
  v_group uuid := (select id from t_groups where label = 'lunch');
  v_err text;
begin
  raise notice '6. quitter un groupe';

  v_err := pg_temp.error_of(format('select public.leave_group(%L)', v_group));
  perform pg_temp.assert(
    v_err = 'omk:group_owner_cannot_leave',
    'le propriétaire ne quitte pas son groupe : il le supprime'
  );
end;
$$;

select set_config('request.jwt.claims', '{"sub":"' || :'mate' || '","role":"authenticated"}', true);

do $$
declare
  v_group uuid := (select id from t_groups where label = 'lunch');
  v_err text;
begin
  perform public.leave_group(v_group);
  perform pg_temp.assert(
    (select count(*) from public.group_members where group_id = v_group) = 0,
    'un membre parti ne voit plus le groupe, ni ses membres'
  );

  v_err := pg_temp.error_of(format('select public.leave_group(%L)', v_group));
  perform pg_temp.assert(v_err = 'omk:group_not_found', 'quitter deux fois ne passe pas');
end;
$$;

-- Le groupe existe toujours, côté propriétaire, avec un membre de moins.
select set_config('request.jwt.claims', '{"sub":"' || :'host' || '","role":"authenticated"}', true);

do $$
declare
  v_group uuid := (select id from t_groups where label = 'lunch');
begin
  perform pg_temp.assert(
    (select count(*) from public.group_members where group_id = v_group) = 1,
    'le groupe survit au départ d''un membre'
  );

  perform pg_temp.assert(
    (select jsonb_array_length(public.export_my_data() -> 'groups')) = 1,
    'l''export RGPD nomme les groupes dont on est membre'
  );

  -- Cette migration réécrit `export_my_data` : elle doit reprendre le corps de
  -- la précédente, pas le remplacer. Une clé perdue ici, c'est une donnée qui
  -- disparaît de l'export de tout le monde.
  perform pg_temp.assert(
    public.export_my_data() ? 'contributed_restaurants'
      and public.export_my_data() ? 'pending_invitations'
      and (public.export_my_data() -> 'participations' -> 0) ? 'restaurants_added',
    'la réécriture de l''export garde les clés des migrations précédentes'
  );
end;
$$;

reset role;
rollback;
