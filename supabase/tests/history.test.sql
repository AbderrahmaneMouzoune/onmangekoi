-- ============================================================
-- onmangekoi — scénario : historique et statistiques (issue #6)
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #6 :
--   * une session clôturée reste accessible en lecture depuis l'historique,
--     avec le gagnant que le classement a désigné ;
--   * les statistiques ne comptent que mes votes — ceux des autres
--     participants n'entrent nulle part ;
--   * la pagination se fait par curseur et non par offset : une session
--     créée entre deux pages ne décale rien, ne saute rien, ne double rien ;
--   * l'historique de quelqu'un d'autre reste invisible, et le helper
--     `session_winner` n'est appelable par aucun rôle.
--
-- Les lectures se font avec `request.jwt.claims` posé : `auth.uid()` ne
-- dépend pas du rôle, et les deux RPC sont `security definer` — elles
-- refont elles-mêmes le contrôle d'accès. Les droits, eux, sont vérifiés
-- pour ce qu'ils sont : des grants, plus un appel réel sous le rôle
-- `authenticated`.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/history.test.sql
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

/** Se met dans la peau de quelqu'un : c'est tout ce que lit `auth.uid()`. */
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

-- ─── FIXTURES ────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  (:'alice', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@example.test', '{"pseudo":"Alice"}'::jsonb),
  (:'bob', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bob@example.test', '{"pseudo":"Bob"}'::jsonb),
  (:'carol', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'carol@example.test', '{"pseudo":"Carol"}'::jsonb);

-- Trois restaurants à nous, aux cuisines distinctes : le scénario ne dépend
-- pas du contenu du seed.
create temporary table t_resto (label text primary key, id uuid not null, position int not null);

with wanted (label, name, cuisine, position) as (
  values ('pho', 'Maison Pho du test', 'Vietnamien', 1),
         ('sushi', 'Sushi du test', 'Japonais', 2),
         ('curry', 'Curry du test', 'Indien', 3)
), created as (
  insert into public.restaurants (name, cuisine_type)
  select w.name, w.cuisine from wanted w
  returning id, name
)
insert into t_resto (label, id, position)
select w.label, c.id, w.position
from wanted w
join created c on c.name = w.name;

-- Cinq sessions : quatre où alice figure, une où elle n'est pas.
-- `created_at` est posé à la main pour que l'ordre soit certain.
create temporary table t_session (label text primary key, id uuid not null);

with wanted (label, name, host, status, days_ago) as (
  values ('lundi',    'Lundi',           :'alice'::uuid, 'closed'::public.session_status, 5),
         ('mardi',    'Mardi',           :'bob'::uuid,   'closed'::public.session_status, 4),
         ('mercredi', 'Mercredi',        :'alice'::uuid, 'closed'::public.session_status, 3),
         ('jeudi',    'Jeudi',           :'alice'::uuid, 'voting'::public.session_status, 2),
         ('sans',     'Chez les autres', :'bob'::uuid,   'closed'::public.session_status, 1)
), created as (
  insert into public.sessions (name, host_id, status, created_at, launched_at, closed_at)
  select
    w.name, w.host, w.status,
    now() - (w.days_ago || ' days')::interval,
    now() - (w.days_ago || ' days')::interval,
    case when w.status = 'closed' then now() - (w.days_ago || ' days')::interval end
  from wanted w
  returning id, name
)
insert into t_session (label, id)
select w.label, c.id
from wanted w
join created c on c.name = w.name;

insert into public.session_restaurants (session_id, restaurant_id, position)
select s.id, r.id, r.position from t_session s, t_resto r;

insert into public.session_participants (session_id, profile_id, has_finished_voting)
select s.id, u.profile_id, true
from t_session s
join (values
  ('lundi',    :'alice'::uuid), ('lundi',    :'bob'::uuid),
  ('mardi',    :'alice'::uuid), ('mardi',    :'bob'::uuid),
  ('mercredi', :'alice'::uuid), ('mercredi', :'carol'::uuid),
  ('jeudi',    :'alice'::uuid), ('jeudi',    :'bob'::uuid),
  ('sans',     :'bob'::uuid),   ('sans',     :'carol'::uuid)
) as u(label, profile_id) on u.label = s.label;

/* Les votes.
   alice aime le vietnamien : coup de cœur (2) sur le pho partout, « ça me
   va » (1) sur le sushi sauf le jeudi, « bof » (0) sur le curry.
   bob penche pour l'indien, y compris dans « Chez les autres » où alice ne
   figure pas : rien de tout ça ne doit entrer dans les chiffres d'alice.
   carol pose un veto sur le pho le mercredi, ce qui fait gagner le curry :
   le gagnant d'une session n'est pas le préféré de qui la consulte. */
insert into public.votes (session_id, participant_id, session_restaurant_id, value)
select sp.session_id, sp.id, sr.id,
  case
    when sp.profile_id = :'alice'::uuid then
      case r.label
        when 'pho' then 2
        when 'sushi' then case when t.label = 'jeudi' then 0 else 1 end
        else 0
      end
    when sp.profile_id = :'bob'::uuid then
      case r.label when 'curry' then 1 else 0 end
    else
      case r.label when 'curry' then 2 when 'pho' then -2 else 0 end
  end
from public.session_participants sp
join t_session t on t.id = sp.session_id
join public.session_restaurants sr on sr.session_id = sp.session_id
join t_resto r on r.id = sr.restaurant_id;

-- ─── L'HISTORIQUE D'ALICE ────────────────────────────────────
select pg_temp.act_as(:'alice');

select pg_temp.assert(
  (select count(*) from public.my_sessions(50)) = 4,
  'mes quatre sessions sont là, hébergées comme rejointes'
);

select pg_temp.assert(
  not exists (select 1 from public.my_sessions(50) where name = 'Chez les autres'),
  'une session où je ne figure pas reste invisible'
);

select pg_temp.assert(
  (select array_agg(name order by created_at desc) from public.my_sessions(2))
    = array['Jeudi', 'Mercredi'],
  'la première page rend la taille demandée, de la plus récente à la plus ancienne'
);

-- ─── UNE SESSION CLOSE RESTE LISIBLE, AVEC SON GAGNANT ───────
select pg_temp.assert(
  (select status = 'closed' and closed_at is not null and length(invite_code) = 6
   from public.my_sessions(50) where name = 'Lundi'),
  'la session close reste accessible en lecture depuis l’historique'
);

select pg_temp.assert(
  (select winner_name = 'Maison Pho du test' and winner_score = 2
   from public.my_sessions(50) where name = 'Lundi'),
  'le gagnant affiché est celui du classement : pho, 2 + 0'
);

select pg_temp.assert(
  (select winner_name = 'Curry du test' and winner_score = 2
   from public.my_sessions(50) where name = 'Mercredi'),
  'le gagnant vient du groupe, pas de mes seuls votes'
);

select pg_temp.assert(
  (select winner_name is null and winner_score is null and closed_at is null
   from public.my_sessions(50) where name = 'Jeudi'),
  'une session encore en cours n’a pas de gagnant'
);

select pg_temp.assert(
  (select is_host from public.my_sessions(50) where name = 'Lundi')
    and not (select is_host from public.my_sessions(50) where name = 'Mardi'),
  'l’historique distingue les sessions que j’organise de celles que je rejoins'
);

select pg_temp.assert(
  (select participant_count = 2 and restaurant_count = 3
   from public.my_sessions(50) where name = 'Lundi'),
  'les compteurs de la ligne sont ceux de la session'
);

-- ─── PAGINATION PAR CURSEUR ──────────────────────────────────
-- Le curseur pointe la dernière ligne rendue : « Mercredi ».
select set_config('omk.cursor_at', s.created_at::text, true),
       set_config('omk.cursor_id', s.id::text, true)
from public.sessions s
where s.name = 'Mercredi';

-- Une session créée entre deux pages ne doit rien décaler : c'est tout ce qui
-- sépare un curseur d'un offset.
with s as (
  insert into public.sessions (name, host_id, status, created_at)
  values ('Vendredi', :'alice', 'waiting', now())
  returning id
)
insert into public.session_participants (session_id, profile_id)
select id, :'alice' from s;

select pg_temp.assert(
  (select array_agg(name order by created_at desc)
   from public.my_sessions(
     2,
     current_setting('omk.cursor_at')::timestamptz,
     current_setting('omk.cursor_id')::uuid
   )) = array['Mardi', 'Lundi'],
  'la page suivante reprend sous le curseur, sans décalage ni doublon'
);

select pg_temp.assert(
  not exists (
    select 1
    from public.sessions s
    cross join lateral public.my_sessions(2, s.created_at, s.id) page
    where s.name = 'Lundi'
  ),
  'passé la dernière ligne, l’historique est vide'
);

select pg_temp.assert(
  (select name from public.my_sessions(1)) = 'Vendredi',
  'la nouvelle session ouvre la première page, sans toucher aux suivantes'
);

select pg_temp.assert(
  (select count(*) from public.my_sessions(500)) = 5,
  'une taille de page démesurée est bornée au lieu de lever'
);

-- ─── STATISTIQUES : MES VOTES, ET RIEN D'AUTRE ───────────────
select pg_temp.assert(
  (select sessions_total = 5 and sessions_closed = 3 and sessions_hosted = 4
   from public.my_stats()),
  'les compteurs de sessions comptent mes participations'
);

select pg_temp.assert(
  (select votes_total = 12 and fav_votes = 4 and veto_votes = 0 from public.my_stats()),
  'les votes comptés sont les miens : trois par session, sur quatre sessions'
);

select pg_temp.assert(
  (select favorite_cuisine = 'Vietnamien' and favorite_cuisine_votes = 4 from public.my_stats()),
  'ma cuisine préférée sort de mes votes positifs, pas de ceux du groupe'
);

select pg_temp.assert(
  (select top_restaurant_name = 'Maison Pho du test' and top_restaurant_wins = 2
   from public.my_stats()),
  'le resto le plus souvent gagnant se compte sur mes sessions closes'
);

-- Bob penche pour l'indien, alice pour le vietnamien : deux comptes, deux
-- lectures. C'est la garantie « les stats ne révèlent que mes propres votes ».
select pg_temp.act_as(:'bob');

select pg_temp.assert(
  (select favorite_cuisine = 'Indien' from public.my_stats()),
  'chacun lit ses propres votes, jamais ceux de son voisin'
);

select pg_temp.assert(
  (select sessions_total = 4 and sessions_hosted = 2 from public.my_stats()),
  'bob ne voit que ses sessions à lui'
);

-- ─── DROITS ──────────────────────────────────────────────────
select pg_temp.assert(
  has_function_privilege(
    'authenticated', 'public.my_sessions(int, timestamptz, uuid)', 'execute'
  )
    and has_function_privilege('authenticated', 'public.my_stats()', 'execute'),
  'un compte peut lire son historique et ses statistiques'
);

select pg_temp.assert(
  not has_function_privilege('anon', 'public.my_sessions(int, timestamptz, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.my_stats()', 'execute'),
  'un visiteur anonyme n’a accès ni à l’un ni à l’autre'
);

select pg_temp.assert(
  not has_function_privilege('authenticated', 'public.session_winner(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.session_winner(uuid)', 'execute'),
  'le helper `session_winner` reste hors de portée d’un appel direct'
);

-- Les grants ci-dessus se vérifient aussi à l'usage : sous le rôle réel, la
-- lecture passe et l'appel du helper est refusé.
select pg_temp.act_as(:'alice');
set local role authenticated;

do $$
declare
  v_total int;
begin
  select count(*) into v_total from public.my_sessions(50);
  if v_total <> 5 then
    raise exception 'ÉCHEC — le rôle authenticated ne lit pas son historique (% lignes)', v_total;
  end if;
  raise notice 'ok — le rôle authenticated lit bien son historique';
end;
$$;

do $$
declare
  v_session uuid;
begin
  select id into v_session from public.sessions where name = 'Lundi';
  perform 1 from public.session_winner(v_session);
  raise exception 'ÉCHEC — session_winner ne devrait être appelable par personne';
exception
  when insufficient_privilege then
    raise notice 'ok — session_winner refuse un appel direct';
end;
$$;

reset role;
select set_config('request.jwt.claims', '', true);

rollback;
