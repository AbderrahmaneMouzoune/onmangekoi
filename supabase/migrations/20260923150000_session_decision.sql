-- ============================================================
-- onmangekoi — « On y va » : du classement à la décision
-- ============================================================
-- Issue #55. Le classement désignait un gagnant, puis le produit s'arrêtait :
-- rien ne disait où le groupe était vraiment allé. Le host pose désormais la
-- décision, et c'est elle que tout le reste raconte.
--   * `sessions.decided_restaurant_id` / `decided_at` : le restaurant retenu
--     et le moment où il l'a été. Facultatifs — une session sans décision
--     reste exactement ce qu'elle était.
--   * `confirm_decision` est le seul chemin d'écriture (aucune policy n'ouvre
--     l'UPDATE de `sessions`) : host seul, session close seulement, et un
--     restaurant de la session — le gagnant par défaut côté interface, mais
--     un ex æquo ou le deuxième quand le premier a baissé le rideau.
--   * La décision reste **modifiable** par le host tant que la session est
--     close — c'est-à-dire pour toujours, une session close ne rouvrant pas.
--     Le cas qui la motive arrive précisément après coup : on arrive devant
--     Marcel, c'est fermé, on va chez le deuxième. Elle n'est en revanche pas
--     révocable : une fois posée, on en change, on ne revient pas au vote seul.
--   * Diffusion : la décision est un UPDATE de la ligne `sessions`, déjà
--     publiée sur `supabase_realtime` (`20260429175627`). La clôture arrive
--     chez les participants par ce même événement — la décision aussi, sans
--     rien ajouter à la publication.
--   * Lectures : `session_results` et `public_results` exposent la décision
--     (`decided`) ; `session_winner` (historique, statistiques),
--     `recent_winners` (anti-fatigue) et `public_list` (liste publique) la
--     préfèrent au gagnant calculé quand elle existe.
-- ============================================================

-- ─── COLONNES ────────────────────────────────────────────────
-- Clé vers `restaurants`, pas vers `session_restaurants` : la décision nomme
-- un lieu, et c'est ce lieu que l'historique et l'anti-fatigue suivent d'une
-- session à l'autre. L'appartenance à la session est vérifiée par la RPC.
-- `on delete set null`, comme `host_id` : un restaurant retiré plus tard ne
-- fait pas disparaître la session, qui retombe sur son classement.
alter table public.sessions
  add column decided_restaurant_id uuid references public.restaurants (id) on delete set null,
  add column decided_at timestamptz;

comment on column public.sessions.decided_restaurant_id is
  'Restaurant où le groupe va, confirmé par le host (« On y va »). Null tant qu''il n''a rien confirmé.';
comment on column public.sessions.decided_at is
  'Moment de la dernière confirmation. Survit à la suppression du restaurant, qui ne remet à null que la clé.';

-- Une décision a toujours une date ; l'inverse n'est pas vrai, justement à
-- cause du `set null` ci-dessus.
alter table public.sessions
  add constraint sessions_decision_has_date
  check (decided_restaurant_id is null or decided_at is not null);

-- Sans index, supprimer un restaurant parcourrait toute la table des sessions
-- pour appliquer le `set null`.
create index sessions_decided_restaurant_id_idx
  on public.sessions (decided_restaurant_id)
  where decided_restaurant_id is not null;

-- ─── RPC : DÉCIDER ───────────────────────────────────────────
create or replace function public.confirm_decision(p_session_id uuid, p_restaurant_id uuid)
  returns public.sessions
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;

  -- `for update` : deux confirmations simultanées se sérialisent, la seconde
  -- l'emporte en connaissance de la première.
  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    perform public.raise_omk('session_not_found');
  end if;
  -- `is distinct from` : un host supprimé laisse `host_id` à null, et plus
  -- personne ne peut décider à sa place.
  if v_session.host_id is distinct from v_uid then
    perform public.raise_omk('host_only');
  end if;
  -- Avant la clôture, il n'y a pas de classement à confirmer.
  if v_session.status <> 'closed' then
    perform public.raise_omk('session_not_closed');
  end if;
  -- Le restaurant doit être l'un de ceux sur lesquels le groupe a voté.
  if p_restaurant_id is null or not exists (
    select 1
    from public.session_restaurants sr
    where sr.session_id = p_session_id
      and sr.restaurant_id = p_restaurant_id
  ) then
    perform public.raise_omk('invalid_restaurant');
  end if;

  -- Reconfirmer le même restaurant ne change rien : ni la date, ni un
  -- événement Realtime de plus chez les participants.
  update public.sessions
     set decided_restaurant_id = p_restaurant_id,
         decided_at = now()
   where id = p_session_id
     and decided_restaurant_id is distinct from p_restaurant_id
  returning * into v_session;

  if not found then
    select * into v_session from public.sessions where id = p_session_id;
  end if;

  return v_session;
end;
$$;

-- ─── GAGNANT D'UNE SESSION ───────────────────────────────────
-- Reprise de `20260923130000_session_history_and_stats.sql`, décision en
-- tête : là où le groupe est allé passe avant ce que le vote désignait.
-- L'historique et les statistiques en héritent. Le type de retour gagne
-- `decided` : il faut supprimer avant de recréer — les fonctions SQL qui
-- l'appellent ne sont liées qu'à son nom et la retrouvent aussitôt.
drop function if exists public.session_winner(uuid);

create function public.session_winner(p_session_id uuid)
  returns table (restaurant_id uuid, name text, score int, decided boolean)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select
    r.id,
    r.name,
    coalesce(sum(v.value), 0)::int,
    coalesce(r.id = s.decided_restaurant_id, false)
  from public.sessions s
  join public.session_restaurants sr on sr.session_id = s.id
  join public.restaurants r on r.id = sr.restaurant_id
  left join public.votes v on v.session_restaurant_id = sr.id
  where s.id = p_session_id
    and s.status = 'closed'
  group by r.id, r.name, sr.id, sr.position, s.tiebreak_winner_id, s.decided_restaurant_id
  order by (r.id is distinct from s.decided_restaurant_id),
           coalesce(sum(v.value), 0) desc,
           count(*) filter (where v.value = 2) desc,
           (sr.id is distinct from s.tiebreak_winner_id),
           sr.position
  limit 1;
$$;

-- ─── HISTORIQUE ──────────────────────────────────────────────
-- Reprise de `my_sessions`, avec `winner_decided` : l'historique distingue
-- « on y est allés » de « le vote désignait ». Nouveau type de retour, donc
-- suppression puis recréation.
drop function if exists public.my_sessions(int, timestamptz, uuid);

create function public.my_sessions(
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
    winner_score int,
    winner_decided boolean
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
    w.score,
    w.decided
  from mine m
  left join lateral public.session_winner(m.id) w on true
  order by m.created_at desc, m.id desc;
$$;

-- ─── RPC : RÉSULTATS ─────────────────────────────────────────
-- Reprise de `20260923120000_tiebreak_runoff_and_draw.sql`, avec `decided` :
-- vrai sur la ligne du restaurant retenu, faux partout ailleurs. Le rang, lui,
-- reste celui du vote — la décision ne réécrit pas le dépouillement, elle
-- s'affiche à côté. Nouveau type de retour : suppression puis recréation.
drop function if exists public.session_results(uuid);

create function public.session_results(p_session_id uuid)
  returns table (
    session_restaurant_id uuid,
    restaurant_id uuid,
    name text,
    cuisine_type text,
    description text,
    photo_url text,
    address text,
    city text,
    website text,
    location jsonb,
    opening_hours jsonb,
    restaurant_position int,
    score int,
    superlikes int,
    likes int,
    dislikes int,
    super_dislikes int,
    votes_count int,
    rank int,
    tiebreak text,
    decided boolean
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with visible as (
    -- Une seule ligne, ou aucune : le classement reste vide tant que la
    -- session n'est pas close, et pour qui n'y participe pas.
    select s.tiebreak_method, s.tiebreak_winner_id, s.decided_restaurant_id
    from public.sessions s
    where s.id = p_session_id
      and s.status = 'closed'
      and public.is_session_participant(p_session_id)
  ),
  tied as (
    select t.session_restaurant_id
    from public.session_tied_restaurants(p_session_id) t
  ),
  scored as (
    select
      sr.id,
      sr.restaurant_id,
      sr.position,
      coalesce(sum(v.value), 0)::int as score,
      (count(*) filter (where v.value = 2))::int as superlikes,
      (count(*) filter (where v.value = 1))::int as likes,
      (count(*) filter (where v.value = 0))::int as dislikes,
      (count(*) filter (where v.value = -2))::int as super_dislikes,
      count(v.id)::int as votes_count
    from public.session_restaurants sr
    left join public.votes v on v.session_restaurant_id = sr.id
    where sr.session_id = p_session_id
    group by sr.id
  )
  select
    s.id,
    r.id,
    r.name,
    r.cuisine_type,
    r.description,
    r.photo_url,
    r.address,
    r.city,
    r.website,
    r.location,
    r.opening_hours,
    s.position as restaurant_position,
    s.score,
    s.superlikes,
    s.likes,
    s.dislikes,
    s.super_dislikes,
    s.votes_count,
    (rank() over (
      order by s.score desc,
               s.superlikes desc,
               (s.id is distinct from visible.tiebreak_winner_id)
    ))::int as rank,
    case
      when tied.session_restaurant_id is null then null
      when visible.tiebreak_method is null then 'tied'
      when visible.tiebreak_method = 'runoff' then 'runoff'
      when s.id = visible.tiebreak_winner_id then 'winner'
      else 'loser'
    end::text as tiebreak,
    coalesce(s.restaurant_id = visible.decided_restaurant_id, false) as decided
  from scored s
  join public.restaurants r on r.id = s.restaurant_id
  cross join visible
  left join tied on tied.session_restaurant_id = s.id
  order by rank, s.position;
$$;

-- ─── PODIUM PUBLIC ───────────────────────────────────────────
-- Reprise de la version du départage, avec `decided`. Le restaurant retenu
-- sort même s'il n'est pas sur le podium : c'est la phrase que le lien doit
-- dire (« on mange chez… »), et un nom de restaurant n'apprend rien de plus
-- sur le groupe que les trois qui s'affichent déjà. Toujours aucun pseudo,
-- aucun détail de vote.
drop function if exists public.public_results(text);

create function public.public_results(p_code text)
  returns table (
    session_name     text,
    closed_at        timestamptz,
    participant_count int,
    rank             int,
    restaurant_name  text,
    cuisine_type     text,
    city             text,
    photo_url        text,
    score            int,
    votes_count      int,
    decided          boolean
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with target as (
    select s.id, s.name, s.closed_at, s.tiebreak_winner_id, s.decided_restaurant_id
    from public.sessions s
    where s.results_public
      and s.status = 'closed'
      and public.normalize_crockford(p_code) ~ '^[0-9A-HJKMNP-TV-Z]{10}$'
      and s.results_code = public.normalize_crockford(p_code)
  ),
  ranked as (
    select
      r.name        as restaurant_name,
      r.cuisine_type as cuisine_type,
      r.city         as city,
      r.photo_url    as photo_url,
      sr.position    as restaurant_position,
      coalesce(sum(v.value), 0)::int as score,
      count(v.id)::int as votes_count,
      (rank() over (
        order by coalesce(sum(v.value), 0) desc,
                 count(*) filter (where v.value = 2) desc,
                 (sr.id is distinct from t.tiebreak_winner_id)
      ))::int as rank,
      coalesce(sr.restaurant_id = t.decided_restaurant_id, false) as decided
    from target t
    join public.session_restaurants sr on sr.session_id = t.id
    join public.restaurants r on r.id = sr.restaurant_id
    left join public.votes v on v.session_restaurant_id = sr.id
    group by sr.id, r.id, sr.position, t.tiebreak_winner_id, t.decided_restaurant_id
  )
  select
    t.name,
    t.closed_at,
    (select count(*)::int from public.session_participants sp where sp.session_id = t.id),
    ranked.rank,
    ranked.restaurant_name,
    ranked.cuisine_type,
    ranked.city,
    ranked.photo_url,
    ranked.score,
    ranked.votes_count,
    ranked.decided
  from target t, ranked
  where ranked.rank <= 3
     or ranked.decided
  order by ranked.rank, ranked.restaurant_position;
$$;

-- ─── ANTI-FATIGUE ────────────────────────────────────────────
-- Reprise de `recent_winners` : une session décidée a un seul « gagnant
-- récent », le restaurant où le groupe est allé — même si le vote en plaçait
-- un autre devant, même si son score était nul. Sans décision, la règle
-- d'avant tient : premier du classement, avec un score positif.
create or replace function public.recent_winners()
  returns table (
    restaurant_id uuid,
    last_won_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with mine as (
    select s.id, s.closed_at, s.tiebreak_winner_id, s.decided_restaurant_id
    from public.sessions s
    join public.session_participants sp
      on sp.session_id = s.id
     and sp.profile_id = (select auth.uid())
    where s.status = 'closed'
      and s.closed_at is not null
      and s.closed_at >= now() - public.recent_winners_window()
  ),
  ranked as (
    select
      m.closed_at,
      m.decided_restaurant_id,
      sr.restaurant_id,
      coalesce(sum(v.value), 0) as score,
      rank() over (
        partition by m.id
        order by coalesce(sum(v.value), 0) desc,
                 count(*) filter (where v.value = 2) desc,
                 (sr.id is distinct from m.tiebreak_winner_id)
      ) as rank_in_session
    from mine m
    join public.session_restaurants sr on sr.session_id = m.id
    left join public.votes v on v.session_restaurant_id = sr.id
    group by m.id, m.closed_at, m.tiebreak_winner_id, m.decided_restaurant_id, sr.id, sr.restaurant_id
  )
  select ranked.restaurant_id, max(ranked.closed_at) as last_won_at
  from ranked
  where case
          when ranked.decided_restaurant_id is not null
            then ranked.restaurant_id = ranked.decided_restaurant_id
          else ranked.rank_in_session = 1 and ranked.score > 0
        end
  group by ranked.restaurant_id
  order by last_won_at desc;
$$;

-- ─── LISTE PUBLIQUE ──────────────────────────────────────────
-- Reprise de `20260923140000_public_lists.sql` : « le plus souvent choisi »
-- compte les décisions quand il y en a, selon la même règle que
-- `recent_winners`. Type de retour inchangé.
create or replace function public.public_list(p_code text)
  returns table (
    share_code text,
    name text,
    restaurant_count int,
    cuisines text[],
    top_restaurant text,
    top_restaurant_wins int,
    updated_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with target as (
    select l.*
    from public.find_list_by_share(p_code) l
    where l.id is not null
      and l.is_public
  ),
  ranked as (
    select
      sr.restaurant_id,
      s.decided_restaurant_id,
      coalesce(sum(v.value), 0) as score,
      rank() over (
        partition by s.id
        order by coalesce(sum(v.value), 0) desc,
                 count(*) filter (where v.value = 2) desc,
                 (sr.id is distinct from s.tiebreak_winner_id)
      ) as rank_in_session
    from target t
    join public.sessions s
      on s.host_id = t.owner_id
     and s.status = 'closed'
    join public.session_restaurants sr on sr.session_id = s.id
    left join public.votes v on v.session_restaurant_id = sr.id
    group by s.id, s.tiebreak_winner_id, s.decided_restaurant_id, sr.id, sr.restaurant_id
  ),
  champion as (
    select r.name, count(*)::int as wins
    from ranked
    join target t on true
    join public.list_restaurants lr
      on lr.list_id = t.id
     and lr.restaurant_id = ranked.restaurant_id
    join public.restaurants r on r.id = ranked.restaurant_id
    where case
            when ranked.decided_restaurant_id is not null
              then ranked.restaurant_id = ranked.decided_restaurant_id
            else ranked.rank_in_session = 1 and ranked.score > 0
          end
    group by r.id, r.name
    order by wins desc, r.name
    limit 1
  )
  select
    t.share_code,
    t.name,
    (select count(*)::int from public.list_restaurants lr where lr.list_id = t.id),
    (
      select coalesce(array_agg(distinct r.cuisine_type order by r.cuisine_type), '{}'::text[])
      from public.list_restaurants lr
      join public.restaurants r on r.id = lr.restaurant_id
      where lr.list_id = t.id
        and r.cuisine_type is not null
    ),
    champion.name,
    champion.wins,
    t.updated_at
  from target t
  left join champion on true;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
revoke execute on function public.confirm_decision(uuid, uuid) from public, anon;
grant execute on function public.confirm_decision(uuid, uuid) to authenticated;

-- Les droits d'une fonction disparaissent avec elle : on les repose, à
-- l'identique de ce que les migrations d'origine avaient ouvert.
revoke execute on function public.session_winner(uuid) from public, anon, authenticated;

revoke execute on function public.my_sessions(int, timestamptz, uuid) from public, anon;
grant execute on function public.my_sessions(int, timestamptz, uuid) to authenticated;

revoke execute on function public.session_results(uuid) from public, anon;
grant execute on function public.session_results(uuid) to authenticated;

revoke execute on function public.public_results(text) from public;
grant execute on function public.public_results(text) to anon, authenticated;
