-- ============================================================
-- onmangekoi — scénario : « On y va », du classement à la décision
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #55 :
--   * seul le host décide, et seulement sur une session close ;
--   * le restaurant retenu fait partie de ceux de la session ;
--   * la décision est facultative : sans elle, rien ne change ;
--   * elle se lit partout — classement des participants, podium public,
--     historique, anti-fatigue — de préférence au gagnant calculé ;
--   * un restaurant supprimé plus tard ne casse pas la session
--     (`on delete set null`), pas plus qu'un host supprimé.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/decision.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'
\set carol '33333333-3333-4333-8333-333333333333'
\set dave  '44444444-4444-4444-8444-444444444444'

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

-- Prend l'identité d'un compte pour les appels suivants : c'est ce que lit
-- `auth.uid()`, donc toutes les RPC. `null` rend l'appelant anonyme.
create or replace function pg_temp.login(p_uid uuid)
  returns void
  language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    case
      when p_uid is null then ''
      else json_build_object('sub', p_uid, 'role', 'authenticated')::text
    end,
    true
  );
end;
$$;

-- Vrai si l'instruction lève bien l'erreur métier attendue.
create or replace function pg_temp.raises(p_sql text, p_code text)
  returns boolean
  language plpgsql
as $$
begin
  execute p_sql;
  return false;
exception
  when others then
    return sqlerrm = 'omk:' || p_code;
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
   'carol@example.test', '{"pseudo":"Carol"}'::jsonb),
  (:'dave', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'dave@example.test', '{"pseudo":"Dave"}'::jsonb);

create temporary table t_user (label text primary key, id uuid not null);
insert into t_user values
  ('alice', :'alice'), ('bob', :'bob'), ('carol', :'carol'), ('dave', :'dave');

-- Cinq restaurants à nous : le scénario ne dépend pas du contenu du seed.
-- Les quatre premiers entrent dans la session, dans cet ordre ; le dernier
-- reste dehors. Marcel finira quatrième au vote — hors podium.
create temporary table t_resto (label text primary key, id uuid not null, position int not null);

with wanted (label, name, cuisine, position) as (
  values ('pho', 'Maison Pho de la décision', 'Vietnamien', 0),
         ('sushi', 'Sushi de la décision', 'Japonais', 1),
         ('curry', 'Curry de la décision', 'Indien', 2),
         ('marcel', 'Chez Marcel de la décision', 'Bistrot', 3),
         ('dehors', 'Pizzeria hors session', 'Italien', 4)
),
inserted as (
  insert into public.restaurants (name, cuisine_type)
  select w.name, w.cuisine from wanted w
  returning id, name
)
insert into t_resto (label, id, position)
select w.label, i.id, w.position
from wanted w
join inserted i on i.name = w.name;

create or replace function pg_temp.resto(p_label text)
  returns uuid
  language sql
as $$
  select id from t_resto where label = p_label;
$$;

-- Session à trois, lancée : alice héberge, bob et carol ont rejoint.
create temporary table t_ctx (session_id uuid, invite_code text, results_code text);

select pg_temp.login(id) from t_user where label = 'alice';
insert into t_ctx (session_id, invite_code, results_code)
select s.id, s.invite_code, s.results_code
from public.create_session(
  'Midi — décision',
  (select array_agg(id order by position) from t_resto where label <> 'dehors')
) s;

select pg_temp.login(id) from t_user where label = 'bob';
select public.join_session((select invite_code from t_ctx));
select pg_temp.login(id) from t_user where label = 'carol';
select public.join_session((select invite_code from t_ctx));

select pg_temp.login(id) from t_user where label = 'alice';
select pg_temp.assert(
  pg_temp.raises(
    format('select public.confirm_decision(%L, %L)', (select session_id from t_ctx), pg_temp.resto('pho')),
    'session_not_closed'
  ),
  'on ne décide pas d’une session en salle d’attente'
);

select public.launch_session((select session_id from t_ctx));

select pg_temp.assert(
  pg_temp.raises(
    format('select public.confirm_decision(%L, %L)', (select session_id from t_ctx), pg_temp.resto('pho')),
    'session_not_closed'
  ),
  'ni d’une session dont le vote est en cours'
);

-- Tout le monde vote, la clôture automatique fait le reste :
--   pho +3, sushi +2, curry +1, Marcel 0 — quatre rangs distincts.
do $$
declare
  v_uid uuid;
  v_sr record;
begin
  foreach v_uid in array (select array_agg(id order by label) from t_user where label <> 'dave') loop
    perform pg_temp.login(v_uid);
    for v_sr in
      select sr.id, sr.position
      from public.session_restaurants sr
      where sr.session_id = (select session_id from t_ctx)
      order by sr.position
    loop
      perform public.submit_vote(
        (select session_id from t_ctx),
        v_sr.id,
        (case
          when v_sr.position = 0 then 1
          when v_sr.position = 1 then case when v_uid = (select id from t_user where label = 'carol') then 0 else 1 end
          when v_sr.position = 2 then case when v_uid = (select id from t_user where label = 'alice') then 1 else 0 end
          else 0
        end)::smallint
      );
    end loop;
  end loop;
end;
$$;

select pg_temp.assert(
  (select status from public.sessions where id = (select session_id from t_ctx)) = 'closed',
  'la session se clôture d’elle-même quand tout le monde a voté'
);

-- ─── SANS DÉCISION : RIEN NE CHANGE ──────────────────────────
select pg_temp.login(id) from t_user where label = 'bob';
create temporary table t_before as
select * from public.session_results((select session_id from t_ctx));

select pg_temp.assert(
  (select count(*) from t_before) = 4
  and not exists (select 1 from t_before where decided)
  and (select restaurant_id from t_before where rank = 1) = pg_temp.resto('pho')
  and (select rank from t_before where restaurant_id = pg_temp.resto('marcel')) = 4,
  'sans décision, le classement est celui du vote et aucune ligne n’est retenue'
);

select pg_temp.assert(
  (select winner_name from public.my_sessions(50) where id = (select session_id from t_ctx))
    = 'Maison Pho de la décision'
  and not (select winner_decided from public.my_sessions(50) where id = (select session_id from t_ctx)),
  'sans décision, l’historique montre le gagnant calculé'
);

select pg_temp.assert(
  exists (select 1 from public.recent_winners() where restaurant_id = pg_temp.resto('pho'))
  and not exists (select 1 from public.recent_winners() where restaurant_id = pg_temp.resto('marcel')),
  'sans décision, l’anti-fatigue retient le premier du classement'
);

-- ─── QUI PEUT DÉCIDER ────────────────────────────────────────
select pg_temp.assert(
  pg_temp.raises(
    format('select public.confirm_decision(%L, %L)', (select session_id from t_ctx), pg_temp.resto('pho')),
    'host_only'
  ),
  'un participant qui n’héberge pas ne décide pas'
);

select pg_temp.login(id) from t_user where label = 'dave';
select pg_temp.assert(
  pg_temp.raises(
    format('select public.confirm_decision(%L, %L)', (select session_id from t_ctx), pg_temp.resto('pho')),
    'host_only'
  ),
  'un inconnu à la session non plus'
);

select pg_temp.login(null);
select pg_temp.assert(
  pg_temp.raises(
    format('select public.confirm_decision(%L, %L)', (select session_id from t_ctx), pg_temp.resto('pho')),
    'not_authenticated'
  ),
  'un appel sans compte est refusé'
);

select pg_temp.login(id) from t_user where label = 'alice';
select pg_temp.assert(
  pg_temp.raises(
    format('select public.confirm_decision(%L, %L)', gen_random_uuid(), pg_temp.resto('pho')),
    'session_not_found'
  ),
  'une session inconnue est signalée comme telle'
);

-- ─── QUEL RESTAURANT ─────────────────────────────────────────
select pg_temp.assert(
  pg_temp.raises(
    format('select public.confirm_decision(%L, %L)', (select session_id from t_ctx), pg_temp.resto('dehors')),
    'invalid_restaurant'
  ),
  'un restaurant qui n’était pas au vote est refusé'
);

select pg_temp.assert(
  pg_temp.raises(
    format('select public.confirm_decision(%L, null)', (select session_id from t_ctx)),
    'invalid_restaurant'
  ),
  'une décision sans restaurant est refusée'
);

select pg_temp.assert(
  (select decided_restaurant_id from public.sessions where id = (select session_id from t_ctx)) is null
  and (select decided_at from public.sessions where id = (select session_id from t_ctx)) is null,
  'les refus ne laissent aucune trace'
);

-- ─── LE HOST DÉCIDE ──────────────────────────────────────────
create temporary table t_decided as
select * from public.confirm_decision((select session_id from t_ctx), pg_temp.resto('pho'));

select pg_temp.assert(
  (select decided_restaurant_id from t_decided) = pg_temp.resto('pho')
  and (select decided_at from t_decided) is not null,
  'le host confirme le gagnant du vote'
);

-- Reconfirmer le même restaurant ne touche à rien. La date est reculée à la
-- main : dans une seule transaction, `now()` ne bouge pas.
update public.sessions
   set decided_at = '2026-01-01T12:00:00Z'
 where id = (select session_id from t_ctx);

select public.confirm_decision((select session_id from t_ctx), pg_temp.resto('pho'));
select pg_temp.assert(
  (select decided_at from public.sessions where id = (select session_id from t_ctx))
    = '2026-01-01T12:00:00Z'::timestamptz,
  'reconfirmer le même restaurant ne réécrit pas la décision'
);

-- Le host change d'avis : Marcel, quatrième au vote.
select public.confirm_decision((select session_id from t_ctx), pg_temp.resto('marcel'));
select pg_temp.assert(
  (select decided_restaurant_id from public.sessions where id = (select session_id from t_ctx))
    = pg_temp.resto('marcel')
  and (select decided_at from public.sessions where id = (select session_id from t_ctx))
    > '2026-01-01T12:00:00Z'::timestamptz,
  'le host peut revenir sur sa décision tant que la session est close'
);

-- ─── LA DÉCISION SE LIT PARTOUT ──────────────────────────────
select pg_temp.login(id) from t_user where label = 'bob';
create temporary table t_after as
select * from public.session_results((select session_id from t_ctx));

select pg_temp.assert(
  (select count(*) from t_after where decided) = 1
  and (select restaurant_id from t_after where decided) = pg_temp.resto('marcel'),
  'les participants lisent la décision dans le classement, sur une seule ligne'
);

select pg_temp.assert(
  (select array_agg(rank order by rank) from t_after)
    = (select array_agg(rank order by rank) from t_before)
  and (select rank from t_after where decided) = 4,
  'la décision ne réécrit pas le dépouillement : Marcel reste quatrième au vote'
);

select pg_temp.assert(
  (select winner_name from public.my_sessions(50) where id = (select session_id from t_ctx))
    = 'Chez Marcel de la décision'
  and (select winner_decided from public.my_sessions(50) where id = (select session_id from t_ctx)),
  'l’historique montre le restaurant décidé plutôt que le gagnant calculé'
);

select pg_temp.assert(
  (select top_restaurant_name from public.my_stats()) = 'Chez Marcel de la décision',
  'les statistiques comptent où le groupe est allé'
);

select pg_temp.assert(
  exists (select 1 from public.recent_winners() where restaurant_id = pg_temp.resto('marcel'))
  and not exists (select 1 from public.recent_winners() where restaurant_id = pg_temp.resto('pho')),
  'l’anti-fatigue retient le restaurant décidé, même à score nul, et lui seul'
);

select pg_temp.login(id) from t_user where label = 'dave';
select pg_temp.assert(
  (select count(*) from public.session_results((select session_id from t_ctx))) = 0,
  'qui ne participe pas ne lit ni classement ni décision'
);

-- Le podium public : la décision sort même hors podium, c'est la phrase
-- que le lien doit dire.
select pg_temp.login(id) from t_user where label = 'alice';
select public.set_results_public((select session_id from t_ctx), true);
select pg_temp.login(null);

grant select on t_ctx to anon;
set local role anon;
create temporary table t_public as
select * from public.public_results((select results_code from t_ctx));
reset role;

select pg_temp.assert(
  (select count(*) from t_public) = 4
  and (select count(*) from t_public where rank <= 3) = 3
  and (select restaurant_name from t_public where decided) = 'Chez Marcel de la décision'
  and (select rank from t_public where decided) = 4,
  'le lien public montre le podium et le restaurant décidé, même quatrième'
);

-- ─── SUPPRESSIONS ────────────────────────────────────────────
select pg_temp.assert(
  (select confdeltype from pg_constraint
   where conrelid = 'public.sessions'::regclass
     and conname = 'sessions_decided_restaurant_id_fkey') = 'n',
  'la clé vers le restaurant décidé est en `on delete set null`'
);

-- Un restaurant ne se supprime qu'une fois sorti de toutes les sessions
-- (`session_restaurants` le retient) : on l'en retire d'abord, en admin.
delete from public.session_restaurants
 where session_id = (select session_id from t_ctx)
   and restaurant_id = pg_temp.resto('marcel');
delete from public.restaurants where id = pg_temp.resto('marcel');

select pg_temp.assert(
  exists (select 1 from public.sessions where id = (select session_id from t_ctx) and status = 'closed')
  and (select decided_restaurant_id from public.sessions where id = (select session_id from t_ctx)) is null
  and (select decided_at from public.sessions where id = (select session_id from t_ctx)) is not null,
  'un restaurant décidé puis supprimé laisse la session intacte, sans décision'
);

select pg_temp.login(id) from t_user where label = 'bob';
select pg_temp.assert(
  not exists (select 1 from public.session_results((select session_id from t_ctx)) where decided)
  and (select winner_name from public.my_sessions(50) where id = (select session_id from t_ctx))
    = 'Maison Pho de la décision'
  and not (select winner_decided from public.my_sessions(50) where id = (select session_id from t_ctx)),
  'la session retombe alors sur son classement, partout'
);

-- Le host supprime son compte : la décision reste, et personne ne la reprend.
select pg_temp.login(id) from t_user where label = 'alice';
select public.confirm_decision((select session_id from t_ctx), pg_temp.resto('sushi'));
delete from auth.users where id = :'alice';

select pg_temp.assert(
  (select host_id from public.sessions where id = (select session_id from t_ctx)) is null
  and (select decided_restaurant_id from public.sessions where id = (select session_id from t_ctx))
    = pg_temp.resto('sushi'),
  'la décision survit à son host'
);

select pg_temp.login(id) from t_user where label = 'bob';
select pg_temp.assert(
  pg_temp.raises(
    format('select public.confirm_decision(%L, %L)', (select session_id from t_ctx), pg_temp.resto('pho')),
    'host_only'
  ),
  'une session orpheline ne se décide plus'
);

-- ─── SURFACE EXPOSÉE ─────────────────────────────────────────
select pg_temp.assert(
  has_function_privilege('authenticated', 'public.confirm_decision(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.confirm_decision(uuid, uuid)', 'execute'),
  'décider est ouvert aux comptes connectés, fermé aux anonymes'
);

select pg_temp.assert(
  not has_function_privilege('authenticated', 'public.session_winner(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.my_sessions(int, timestamptz, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.session_results(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.session_results(uuid)', 'execute')
  and has_function_privilege('anon', 'public.public_results(text)', 'execute'),
  'les fonctions recréées gardent exactement leurs droits d’avant'
);

select pg_temp.assert(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions'
  ),
  'la ligne de session est publiée sur Realtime : la décision arrive comme la clôture'
);

rollback;
