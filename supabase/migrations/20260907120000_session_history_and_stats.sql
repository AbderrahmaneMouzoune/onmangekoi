-- ============================================================
-- onmangekoi — historique des sessions et statistiques personnelles
-- ============================================================
-- Issue #6. Après la clôture, une session sortait de la navigation : plus
-- moyen de retrouver « où on a mangé mardi ». Deux lectures agrégées y
-- répondent, dans la continuité des règles déjà posées :
--   * `my_sessions` pagine mes sessions (host ou participant) par curseur —
--     jamais par offset : une session créée pendant qu'on feuillette ne
--     décale pas la page suivante.
--   * `my_stats` compte ce qui me concerne, et rien d'autre : mes votes à
--     moi, jamais ceux des autres. Le seul chiffre issu du groupe est le
--     gagnant d'une session close, qui est déjà une agrégation publique
--     pour ses participants (`session_results`).
--   * Les deux sont `security definer` et refont le contrôle d'accès en
--     clair (`sp.profile_id = auth.uid()`), donc la RLS reste inchangée.
-- ============================================================

-- ─── GAGNANT D'UNE SESSION ───────────────────────────────────
-- La règle de départage est celle de `session_results` : score, puis nombre
-- de coups de cœur, puis ordre de présentation. La factoriser ici évite que
-- l'historique et le classement racontent un jour deux gagnants différents.
-- Ne renvoie rien tant que la session n'est pas close : avant la clôture il
-- n'y a pas de gagnant, seulement un classement en cours qu'on ne montre à
-- personne.
--
-- Helper interne : aucun rôle ne peut l'appeler (ni `anon`, ni
-- `authenticated`), sans quoi n'importe qui lirait le gagnant de n'importe
-- quelle session en devinant son uuid. Les fonctions ci-dessous, exécutées
-- avec les droits du propriétaire, y accèdent après avoir vérifié que
-- l'appelant participe bien à la session.
create or replace function public.session_winner(p_session_id uuid)
  returns table (restaurant_id uuid, name text, score int)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select r.id, r.name, coalesce(sum(v.value), 0)::int
  from public.session_restaurants sr
  join public.restaurants r on r.id = sr.restaurant_id
  left join public.votes v on v.session_restaurant_id = sr.id
  where sr.session_id = p_session_id
    and exists (
      select 1 from public.sessions s
      where s.id = p_session_id and s.status = 'closed'
    )
  group by r.id, r.name, sr.position
  order by coalesce(sum(v.value), 0) desc,
           count(*) filter (where v.value = 2) desc,
           sr.position
  limit 1;
$$;

-- ─── HISTORIQUE ──────────────────────────────────────────────
-- Pagination par curseur : `(created_at, id)` strictement inférieur au
-- couple de la dernière ligne rendue. L'id départage deux sessions créées
-- dans la même microseconde et garantit qu'aucune ligne n'est sautée ni
-- servie deux fois. Un curseur sans id (ou tronqué) retombe sur l'uuid nul,
-- c'est-à-dire « tout ce qui est strictement plus ancien ».
create or replace function public.my_sessions(
  p_limit int default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
  returns table (
    id uuid,
    name text,
    invite_code text,
    status public.session_status,
    created_at timestamptz,
    closed_at timestamptz,
    is_host boolean,
    participant_count int,
    restaurant_count int,
    winner_name text,
    winner_score int
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with mine as (
    select s.id, s.name, s.invite_code, s.status, s.created_at, s.closed_at, s.host_id
    from public.sessions s
    join public.session_participants sp
      on sp.session_id = s.id
     and sp.profile_id = (select auth.uid())
    where (select auth.uid()) is not null
      and (
        p_cursor_created_at is null
        or (s.created_at, s.id) < (
          p_cursor_created_at,
          coalesce(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid)
        )
      )
    order by s.created_at desc, s.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  )
  select
    m.id,
    m.name,
    m.invite_code,
    m.status,
    m.created_at,
    m.closed_at,
    coalesce(m.host_id = (select auth.uid()), false),
    (select count(*)::int from public.session_participants sp where sp.session_id = m.id),
    (select count(*)::int from public.session_restaurants sr where sr.session_id = m.id),
    w.name,
    w.score
  from mine m
  left join lateral public.session_winner(m.id) w on true
  order by m.created_at desc, m.id desc;
$$;

-- ─── STATISTIQUES ────────────────────────────────────────────
-- Tout est compté sur mes seules participations. `favorite_cuisine` sort de
-- mes votes positifs (« ça me va » et « coup de cœur ») : personne d'autre
-- n'y entre. Le taux de coups de cœur n'est pas calculé ici — on renvoie les
-- deux compteurs, l'affichage en fait ce qu'il veut.
create or replace function public.my_stats()
  returns table (
    sessions_total int,
    sessions_hosted int,
    sessions_closed int,
    votes_total int,
    fav_votes int,
    veto_votes int,
    favorite_cuisine text,
    favorite_cuisine_votes int,
    top_restaurant_name text,
    top_restaurant_wins int
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with mine as (
    select sp.id as participant_id, s.id as session_id, s.status, s.host_id
    from public.session_participants sp
    join public.sessions s on s.id = sp.session_id
    where (select auth.uid()) is not null
      and sp.profile_id = (select auth.uid())
  ),
  my_votes as (
    select v.value, r.cuisine_type
    from public.votes v
    join mine m on m.participant_id = v.participant_id
    join public.session_restaurants sr on sr.id = v.session_restaurant_id
    join public.restaurants r on r.id = sr.restaurant_id
  ),
  cuisine as (
    select mv.cuisine_type, count(*)::int as cuisine_votes
    from my_votes mv
    where mv.value >= 1
      and mv.cuisine_type is not null
    group by mv.cuisine_type
    order by cuisine_votes desc, mv.cuisine_type
    limit 1
  ),
  winners as (
    select w.name, count(*)::int as wins
    from (select session_id from mine where status = 'closed') closed
    cross join lateral public.session_winner(closed.session_id) w
    group by w.name
    order by wins desc, w.name
    limit 1
  )
  select
    (select count(*)::int from mine),
    (select count(*)::int from mine where host_id = (select auth.uid())),
    (select count(*)::int from mine where status = 'closed'),
    (select count(*)::int from my_votes),
    (select count(*)::int from my_votes where value = 2),
    (select count(*)::int from my_votes where value = -2),
    (select cuisine_type from cuisine),
    coalesce((select cuisine_votes from cuisine), 0),
    (select name from winners),
    coalesce((select wins from winners), 0);
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
revoke execute on function public.session_winner(uuid) from public, anon, authenticated;

revoke execute on function public.my_sessions(int, timestamptz, uuid) from public, anon;
grant execute on function public.my_sessions(int, timestamptz, uuid) to authenticated;

revoke execute on function public.my_stats() from public, anon;
grant execute on function public.my_stats() to authenticated;
