-- ============================================================
-- onmangekoi — départage d'une égalité parfaite
-- ============================================================
--   * Jusqu'ici, deux restaurants à égalité en tête (même score, même nombre
--     de coups de cœur) étaient annoncés puis laissés au débat. Le host peut
--     désormais trancher depuis le classement, de deux façons.
--   * `create_runoff_session` rejoue la session avec les seuls ex æquo : les
--     mêmes participants — personne n'a à rejoindre — et des jokers remis à
--     zéro. La session fille pointe son premier tour par `parent_session_id`.
--   * `draw_winner` tire au sort **en base**, jamais côté client, et stocke le
--     gagnant dans `sessions.tiebreak_winner_id` : tout le monde lit le même
--     résultat, y compris qui ouvre la page une heure plus tard.
--   * `session_results` expose l'état du départage dans une colonne
--     `tiebreak`, pour que l'interface n'ait rien à recalculer.
-- ============================================================

-- ─── COLONNES ────────────────────────────────────────────────
create type public.tiebreak_method as enum ('runoff', 'draw');

alter table public.sessions
  add column parent_session_id  uuid references public.sessions (id) on delete set null,
  add column tiebreak_method    public.tiebreak_method,
  add column tiebreak_winner_id uuid references public.session_restaurants (id) on delete set null;

comment on column public.sessions.parent_session_id is
  'Session dont celle-ci est le second tour. Null pour un premier tour.';
comment on column public.sessions.tiebreak_method is
  'Comment l''égalité de tête a été tranchée : second tour ou tirage au sort. Null tant qu''elle ne l''est pas.';
comment on column public.sessions.tiebreak_winner_id is
  'Restaurant désigné par le tirage au sort, parmi les ex æquo de cette session.';

-- Un tirage a toujours un gagnant, un second tour n'en désigne aucun : c'est
-- la session fille qui tranche.
alter table public.sessions
  add constraint sessions_tiebreak_winner_matches_method
  check (
    case tiebreak_method
      when 'draw' then tiebreak_winner_id is not null
      else tiebreak_winner_id is null
    end
  );

-- Une session n'a qu'un second tour : deux clics du host ne créent pas deux
-- sessions filles. La garantie est portée par l'index, pas seulement par la RPC.
create unique index sessions_parent_session_id_key
  on public.sessions (parent_session_id)
  where parent_session_id is not null;

-- ─── HELPERS ─────────────────────────────────────────────────

-- Entier uniforme dans [0, p_bound). Un modulo sur un espace qui ne se divise
-- pas en parts égales favorise les premières valeurs : on rejette la queue qui
-- déborde plutôt que de la replier. `gen_random_bytes` est la même source que
-- celle des codes d'invitation.
create or replace function public.random_below(p_bound int)
  returns int
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  -- 4 octets tirés à la fois : l'espace des valeurs possibles.
  v_span constant bigint := 4294967296;
  v_limit bigint;
  v_bytes bytea;
  v_draw bigint;
begin
  if p_bound is null or p_bound < 1 then
    raise exception 'omk:invalid_bound' using errcode = 'P0001';
  end if;

  v_limit := (v_span / p_bound) * p_bound;
  loop
    v_bytes := extensions.gen_random_bytes(4);
    v_draw := (get_byte(v_bytes, 0)::bigint * 16777216)
            + (get_byte(v_bytes, 1)::bigint * 65536)
            + (get_byte(v_bytes, 2)::bigint * 256)
            + get_byte(v_bytes, 3)::bigint;
    exit when v_draw < v_limit;
  end loop;

  return (v_draw % p_bound)::int;
end;
$$;

-- Les ex æquo en tête d'une session : même score et même nombre de coups de
-- cœur, soit les deux critères du classement. Ne renvoie rien quand un seul
-- restaurant occupe la première place — il n'y a alors rien à départager.
create or replace function public.session_tied_restaurants(p_session_id uuid)
  returns table (session_restaurant_id uuid)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with scored as (
    select
      sr.id,
      sr.position,
      coalesce(sum(v.value), 0)::int as score,
      (count(*) filter (where v.value = 2))::int as superlikes
    from public.session_restaurants sr
    left join public.votes v on v.session_restaurant_id = sr.id
    where sr.session_id = p_session_id
    group by sr.id
  ),
  top as (
    select s.score, s.superlikes, count(*) as tied
    from scored s
    group by s.score, s.superlikes
    order by s.score desc, s.superlikes desc
    limit 1
  )
  select scored.id
  from scored
  join top on top.score = scored.score
          and top.superlikes = scored.superlikes
          and top.tied > 1
  order by scored.position;
$$;

-- ─── RPC : DÉPARTAGE ─────────────────────────────────────────

-- Garde commune aux deux départages : le host d'une session close dont
-- l'égalité n'est pas encore tranchée. Renvoie les ex æquo.
-- `is distinct from` et non `<>` : un host supprimé laisse `host_id` à null,
-- et une comparaison à null ne dirait ni oui ni non.
create or replace function public.tiebreak_candidates(p_session_id uuid)
  returns uuid[]
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_tied uuid[];
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;

  -- `for update` : deux « Départager » simultanés se sérialisent, le second
  -- voit le premier et repart en `tiebreak_settled`.
  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    perform public.raise_omk('session_not_found');
  end if;
  if v_session.host_id is distinct from v_uid then
    perform public.raise_omk('host_only');
  end if;
  if v_session.status <> 'closed' then
    perform public.raise_omk('session_not_closed');
  end if;
  if v_session.tiebreak_method is not null then
    perform public.raise_omk('tiebreak_settled');
  end if;

  select array_agg(t.session_restaurant_id)
    into v_tied
  from public.session_tied_restaurants(p_session_id) t;

  if v_tied is null or array_length(v_tied, 1) < 2 then
    perform public.raise_omk('no_tie');
  end if;

  return v_tied;
end;
$$;

-- Second tour : une nouvelle session avec les seuls ex æquo et les mêmes
-- participants. Jokers remis à zéro (les colonnes reprennent leur défaut) et
-- vote ouvert d'emblée — personne n'a à rejoindre, il n'y a pas de salle
-- d'attente à tenir.
create or replace function public.create_runoff_session(p_session_id uuid)
  returns public.sessions
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_tied uuid[] := public.tiebreak_candidates(p_session_id);
  v_session public.sessions;
  v_runoff public.sessions;
begin
  select * into v_session from public.sessions where id = p_session_id;

  insert into public.sessions (name, host_id, invite_code, parent_session_id, status, launched_at)
  values (
    v_session.name,
    v_session.host_id,
    public.generate_invite_code(),
    v_session.id,
    'voting',
    now()
  )
  returning * into v_runoff;

  -- Les ex æquo, dans l'ordre du premier tour.
  insert into public.session_restaurants (session_id, restaurant_id, position)
  select v_runoff.id, sr.restaurant_id, (row_number() over (order by sr.position) - 1)::int
  from public.session_restaurants sr
  where sr.id = any (v_tied);

  -- Les mêmes participants. Un compte supprimé (`profile_id` à null) ne
  -- revote pas : sa ligne du premier tour reste où elle est.
  insert into public.session_participants (session_id, profile_id)
  select v_runoff.id, sp.profile_id
  from public.session_participants sp
  where sp.session_id = v_session.id
    and sp.profile_id is not null;

  update public.sessions
    set tiebreak_method = 'runoff'
    where id = v_session.id;

  return v_runoff;
end;
$$;

-- Tirage au sort. Le résultat est écrit en base : il ne dépend ni du
-- navigateur, ni du moment où chacun ouvre la page.
create or replace function public.draw_winner(p_session_id uuid)
  returns public.sessions
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_tied uuid[] := public.tiebreak_candidates(p_session_id);
  v_session public.sessions;
begin
  update public.sessions
    set tiebreak_method = 'draw',
        tiebreak_winner_id = v_tied[public.random_below(array_length(v_tied, 1)) + 1]
    where id = p_session_id
    returning * into v_session;

  return v_session;
end;
$$;

-- ─── RPC : RÉSULTATS ─────────────────────────────────────────
-- Le type de retour change (`tiebreak`) : il faut supprimer avant de recréer.
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
    tiebreak text
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with visible as (
    -- Une seule ligne, ou aucune : le classement reste vide tant que la
    -- session n'est pas close, et pour qui n'y participe pas.
    select s.tiebreak_method, s.tiebreak_winner_id
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
    -- Le tirage tranche le classement lui-même : le désigné passe seul en
    -- tête, les autres ex æquo gardent leur score au rang suivant. Sans
    -- tirage, la comparaison est vraie partout et ne change rien.
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
    end::text as tiebreak
  from scored s
  join public.restaurants r on r.id = s.restaurant_id
  cross join visible
  left join tied on tied.session_restaurant_id = s.id
  order by rank, s.position;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
-- `random_below`, `session_tied_restaurants` et `tiebreak_candidates` sont des
-- rouages internes : elles ne sont appelées que depuis les RPC ci-dessus, qui
-- s'exécutent avec les droits de leur propriétaire. Rien à ouvrir au client.
revoke execute on function public.random_below(int) from public, anon, authenticated;
revoke execute on function public.session_tied_restaurants(uuid) from public, anon, authenticated;
revoke execute on function public.tiebreak_candidates(uuid) from public, anon, authenticated;

revoke execute on function public.create_runoff_session(uuid) from public, anon;
grant execute on function public.create_runoff_session(uuid) to authenticated;

revoke execute on function public.draw_winner(uuid) from public, anon;
grant execute on function public.draw_winner(uuid) to authenticated;

-- Les droits d'une fonction disparaissent avec elle : on les repose.
revoke execute on function public.session_results(uuid) from public, anon;
grant execute on function public.session_results(uuid) to authenticated;
