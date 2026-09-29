-- ============================================================
-- onmangekoi — une sélection proposée à la création
-- ============================================================
-- Issue #59. Composer la sélection est l'étape la plus lourde de la
-- création, et elle retombe sur le host à chaque midi. Corriger une
-- proposition coûte bien moins que partir d'une page blanche — et la base
-- sait déjà ce qu'il faut pour en faire une : les restaurants des sessions
-- où la personne était (#6), et ceux qui viennent de gagner (#5).
--
-- Principes :
--   * `suggest_restaurants(p_limit)` ne prend pas d'identifiant : elle
--     répond pour `auth.uid()`, comme `recent_winners()`. L'historique de Sam
--     ne regarde que Sam.
--   * Elle ne lit que des participations et des gagnants. Ni score, ni
--     classement, ni vote : `recent_winners()` est la seule porte vers le
--     résultat d'une session, et elle ne rend déjà que le premier.
--   * Pas d'historique, pas de proposition. Une sélection tirée du catalogue
--     pour qui n'a jamais rien vu serait une suggestion au hasard — la page
--     reste alors exactement ce qu'elle était.
--   * Chaque ligne dit pourquoi elle est là (`reason`) et d'où elle vient
--     (`source`), et porte le nombre de gagnants écartés : de quoi écrire la
--     phrase qui explique la sélection sans seconde requête.
--   * Les restaurants sont en lecture publique (`restaurants_select_public`) :
--     tout ce qui sort d'ici est visible de l'appelant. La ligne entière est
--     rendue pour que le panier affiche un resto pré-coché même absent de la
--     première page du carnet — sans aller le rechercher carte par carte.
-- ============================================================

-- ─── SUGGESTION ──────────────────────────────────────────────
-- Deux sortes de lignes :
--   * `recent` — les restaurants vus le plus récemment dans une session où
--     l'appelant était, gagnants de la fenêtre anti-fatigue (30 jours,
--     décisions « On y va » comprises) retirés. Le plus récent d'abord ;
--     `p_limit - 1` au plus, pour laisser la place au suivant.
--   * `never_proposed` — un seul, jamais vu dans une de ses sessions, choisi
--     sans hasard : le dernier que la personne a mis dans une de ses listes
--     ou ajouté elle-même (`source = 'mine'`), sinon le dernier arrivé au
--     carnet (`source = 'catalog'`). Il n'apparaît qu'à côté d'au moins une
--     ligne `recent` : seul, il ne serait plus une suggestion.
--
-- `p_limit` est borné à [1, 10] : une proposition de trente restos ne se
-- corrige pas plus vite qu'une page blanche. À 1, il n'y a de place que pour
-- un `recent`.
create or replace function public.suggest_restaurants(p_limit int default 5)
  returns table (
    restaurant public.restaurants,
    reason text,
    source text,
    excluded_winners int
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with bounds as (
    select least(greatest(coalesce(p_limit, 5), 1), 10) as total
  ),
  winners as (
    select w.restaurant_id from public.recent_winners() w
  ),
  -- Tout ce qui a été proposé dans une session de l'appelant, quel que soit
  -- son statut : un resto sur la table d'une session en cours a été vu.
  seen as (
    select sr.restaurant_id, max(s.created_at) as last_seen_at
    from public.sessions s
    join public.session_participants sp
      on sp.session_id = s.id
     and sp.profile_id = (select auth.uid())
    join public.session_restaurants sr on sr.session_id = s.id
    where (select auth.uid()) is not null
    group by sr.restaurant_id
  ),
  recent as (
    select seen.restaurant_id, seen.last_seen_at
    from seen
    join public.restaurants r on r.id = seen.restaurant_id
    where not exists (select 1 from winners w where w.restaurant_id = seen.restaurant_id)
    order by seen.last_seen_at desc, r.name, r.id
    limit (select greatest(b.total - 1, 1) from bounds b)
  ),
  -- Les restos de la personne : ceux de ses listes, datés de leur entrée
  -- dans la liste, et ceux qu'elle a ajoutés au carnet elle-même.
  mine as (
    select lr.restaurant_id, lr.added_at
    from public.list_restaurants lr
    join public.lists l
      on l.id = lr.list_id
     and l.owner_id = (select auth.uid())
    union all
    select r.id, r.created_at
    from public.restaurants r
    where r.created_by = (select auth.uid())
  ),
  candidates as (
    select m.restaurant_id, 'mine'::text as source, 0 as tier, max(m.added_at) as added_at
    from mine m
    group by m.restaurant_id
    union all
    select r.id, 'catalog'::text, 1, r.created_at
    from public.restaurants r
  ),
  fresh as (
    select c.restaurant_id, c.source
    from candidates c
    where (select b.total from bounds b) >= 2
      and exists (select 1 from recent)
      and not exists (select 1 from seen where seen.restaurant_id = c.restaurant_id)
    order by c.tier, c.added_at desc, c.restaurant_id
    limit 1
  ),
  picked as (
    select recent.restaurant_id, 'recent'::text as reason, 'history'::text as source,
           0 as tier, recent.last_seen_at as sort_at
    from recent
    union all
    select fresh.restaurant_id, 'never_proposed', fresh.source, 1, null::timestamptz
    from fresh
  )
  select r, p.reason, p.source, (select count(*)::int from winners)
  from picked p
  join public.restaurants r on r.id = p.restaurant_id
  order by p.tier, p.sort_at desc nulls last, r.name, r.id;
$$;

comment on function public.suggest_restaurants(int) is
  'Sélection proposée à la création d''une session : les restaurants vus '
  'récemment par l''appelant hors gagnants récents, plus un jamais proposé. '
  'Vide sans historique. Ne lit ni score ni vote.';

-- ─── GRANTS ──────────────────────────────────────────────────
revoke execute on function public.suggest_restaurants(int) from public, anon;
grant execute on function public.suggest_restaurants(int) to authenticated;
