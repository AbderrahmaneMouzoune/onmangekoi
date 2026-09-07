-- ============================================================
-- onmangekoi — partage public du classement
-- ============================================================
--   * `sessions.results_code` : un code Crockford de 10 symboles, distinct du
--     code d'invitation. Le code d'invitation se dit à voix haute (6 symboles
--     suffisent, il ne vaut que le temps d'une session) ; le lien public, lui,
--     traîne dans un fil Slack : il lui faut assez d'entropie pour ne pas se
--     deviner, et surtout il doit pouvoir devenir caduc sans casser
--     l'invitation.
--   * `sessions.results_public` : le partage est opt-in, décidé par le host
--     seul, via `set_results_public`. Aucune policy n'ouvre l'UPDATE de
--     `sessions` : cette RPC est le seul chemin.
--   * `public_results(code)` est la seule lecture ouverte au rôle `anon`.
--     Elle n'expose que le nom de la session, le nombre de participants et le
--     podium (rangs 1 à 3) — jamais un pseudo, jamais le détail des votes,
--     jamais une ligne au-delà du podium.
-- ============================================================

-- ─── CODE DU CLASSEMENT PUBLIC ───────────────────────────────
create or replace function public.generate_results_code()
  returns text
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := public.crockford_code(10);
    exit when not exists (select 1 from public.sessions where results_code = v_code);
  end loop;
  return v_code;
end;
$$;

alter table public.sessions
  add column if not exists results_code text,
  add column if not exists results_public boolean not null default false;

do $$
declare
  r record;
begin
  for r in select id from public.sessions where results_code is null loop
    update public.sessions set results_code = public.generate_results_code() where id = r.id;
  end loop;
end;
$$;

alter table public.sessions
  alter column results_code set not null,
  alter column results_code set default public.generate_results_code();

create unique index if not exists sessions_results_code_key
  on public.sessions (results_code);

comment on column public.sessions.results_code is
  'Code Crockford (10) du lien public `/r/<code>`, distinct du code d''invitation.';
comment on column public.sessions.results_public is
  'Le host a-t-il ouvert le podium à quiconque a le lien ? Faux par défaut.';

-- ─── OPT-IN DU HOST ──────────────────────────────────────────
create or replace function public.set_results_public(p_session_id uuid, p_public boolean)
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

  select * into v_session from public.sessions where id = p_session_id;
  if v_session.id is null then
    perform public.raise_omk('session_not_found');
  end if;
  if v_session.host_id is distinct from v_uid then
    perform public.raise_omk('host_only');
  end if;
  -- Un classement n'existe qu'une fois la session close : ouvrir le lien
  -- avant, ce serait publier une page vide.
  if v_session.status <> 'closed' then
    perform public.raise_omk('session_not_closed');
  end if;

  update public.sessions
     set results_public = coalesce(p_public, false)
   where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

-- ─── LECTURE PUBLIQUE ────────────────────────────────────────
-- `security definer` : le rôle `anon` ne voit aucune table de session sous
-- RLS, c'est cette fonction — et son `where` — qui décide de ce qui sort.
create or replace function public.public_results(p_code text)
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
    votes_count      int
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with target as (
    select s.id, s.name, s.closed_at
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
                 count(*) filter (where v.value = 2) desc
      ))::int as rank
    from target t
    join public.session_restaurants sr on sr.session_id = t.id
    join public.restaurants r on r.id = sr.restaurant_id
    left join public.votes v on v.session_restaurant_id = sr.id
    group by sr.id, r.id, sr.position
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
    ranked.votes_count
  from target t, ranked
  where ranked.rank <= 3
  order by ranked.rank, ranked.restaurant_position;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
-- `generate_results_code` sert de valeur par défaut à `sessions.results_code` :
-- comme pour `lists.share_code`, la valeur est évaluée avec le rôle qui insère,
-- l'exécution doit donc lui rester ouverte. La fonction est security definer et
-- ne renvoie qu'un code libre tiré au hasard.
revoke execute on function public.generate_results_code() from public, anon;
grant execute on function public.generate_results_code() to authenticated;

revoke execute on function public.set_results_public(uuid, boolean) from public, anon;
grant execute on function public.set_results_public(uuid, boolean) to authenticated;

-- La seule fonction de session ouverte à `anon` : c'est tout l'objet du lien.
revoke execute on function public.public_results(text) from public;
grant execute on function public.public_results(text) to anon, authenticated;
