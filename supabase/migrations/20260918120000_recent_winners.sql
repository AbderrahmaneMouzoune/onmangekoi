-- ============================================================
-- onmangekoi — anti-fatigue : les gagnants récents
-- ============================================================
-- Le même restaurant gagne trois vendredis de suite et le vote finit par
-- ressembler à une formalité. La base sait pourtant déjà ce qu'il faut pour
-- le dire : les sessions closes, qui y a participé, et ce qui en est sorti
-- premier.
--
-- Principes :
--   * `recent_winners()` ne prend pas d'identifiant : elle répond pour
--     l'appelant, `auth.uid()`, et pour lui seul. Un paramètre `user_id` se
--     falsifierait depuis le navigateur — la fatigue de Sam ne regarde que Sam.
--   * Une seule ligne par restaurant : la date du dernier sacre suffit à
--     écrire « Gagnant il y a 6 jours » comme à écarter le resto d'une
--     nouvelle session.
--   * Rien du détail des votes ne sort d'ici. Ni score, ni qui a voté quoi :
--     le gagnant d'une session close est déjà public pour ses participants,
--     ce qui n'est pas le cas du reste du classement.
--   * La fenêtre (30 jours) est une constante, `recent_winners_window()`.
--     Elle a son double côté application, `RECENT_WINNER_WINDOW_DAYS` : les
--     deux doivent rester d'accord, le scénario SQL fige la valeur en base.
-- ============================================================

-- ─── FENÊTRE ─────────────────────────────────────────────────
create or replace function public.recent_winners_window()
  returns interval
  language sql
  immutable
  set search_path = ''
as $$
  select interval '30 days';
$$;

comment on function public.recent_winners_window() is
  'Durée pendant laquelle un restaurant gagnant reste « récent ». '
  'Doit rester d''accord avec RECENT_WINNER_WINDOW_DAYS côté application.';

-- ─── GAGNANTS RÉCENTS ────────────────────────────────────────
-- Le classement d'une session est celui de `session_results` : score, puis
-- coups de cœur en cas d'égalité. Deux restaurants à égalité parfaite sont
-- deux gagnants — c'est aussi ce que montre l'écran de classement.
--
-- Un score nul ou négatif ne fait pas un gagnant : quand personne n'a dit oui
-- à rien, la session n'a fatigué personne et écarter toute la liste à la
-- session suivante serait absurde.
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
    select s.id, s.closed_at
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
      sr.restaurant_id,
      coalesce(sum(v.value), 0) as score,
      rank() over (
        partition by m.id
        order by coalesce(sum(v.value), 0) desc,
                 count(*) filter (where v.value = 2) desc
      ) as rank_in_session
    from mine m
    join public.session_restaurants sr on sr.session_id = m.id
    left join public.votes v on v.session_restaurant_id = sr.id
    group by m.id, m.closed_at, sr.restaurant_id
  )
  select ranked.restaurant_id, max(ranked.closed_at) as last_won_at
  from ranked
  where ranked.rank_in_session = 1
    and ranked.score > 0
  group by ranked.restaurant_id
  order by last_won_at desc;
$$;

comment on function public.recent_winners() is
  'Restaurants sortis premiers des sessions closes auxquelles l''appelant a '
  'participé dans la fenêtre courante, avec la date du dernier sacre.';

-- ─── GRANTS ──────────────────────────────────────────────────
revoke execute on function public.recent_winners_window() from public, anon;
revoke execute on function public.recent_winners() from public, anon;
grant execute on function public.recent_winners_window() to authenticated;
grant execute on function public.recent_winners() to authenticated;
