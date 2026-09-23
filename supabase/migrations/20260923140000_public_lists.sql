-- ============================================================
-- onmangekoi — la liste partagée comme objet public
-- ============================================================
-- `/l/<code>` existait déjà, mais en page utilitaire réservée à qui reçoit le
-- lien. C'est pourtant le seul objet du produit qu'on recommande
-- spontanément : « les restos du bureau » se partage, alors qu'un classement
-- ne se montre qu'une fois.
--
-- Principes, repris de `public_results` (#19) :
--   * `lists.is_public` : le partage public est **opt-in**, décidé par le
--     propriétaire seul. Faux par défaut, et il le redevient d'un clic. La
--     policy `lists_owner_all` et un grant sur la colonne suffisent à
--     l'écrire — contrairement aux sessions, une liste est déjà modifiable
--     par son propriétaire.
--   * `public_list(code)` est ouverte au rôle `anon`. Elle ne rend que le nom
--     de la liste, des compteurs, les cuisines représentées et, quand
--     l'historique est là, le restaurant le plus souvent choisi. **Jamais le
--     propriétaire** — ni son pseudo, ni son id, ni l'existence de ses autres
--     listes.
--   * `public_list_restaurants(code)` montre le contenu de la liste, et
--     seulement d'une liste publique : la page étant indexable, le code cesse
--     d'être un secret dès qu'elle est publiée. La lecture publique se filtre
--     donc sur `is_public`, jamais sur la discrétion du code.
--   * `public_lists()` énumère les codes publics pour `sitemap.ts`. Une liste
--     privée n'y figure pas — la remettre en privé la fait sortir du sitemap
--     à la revalidation suivante.
-- ============================================================

-- ─── OPT-IN DU PROPRIÉTAIRE ──────────────────────────────────
alter table public.lists
  add column if not exists is_public boolean not null default false;

comment on column public.lists.is_public is
  'Le propriétaire a-t-il ouvert la liste à tout le monde (page présentable, '
  'sitemap, image Open Graph) ? Faux par défaut.';

-- L'update de `lists` est accordé colonne par colonne
-- (`20260904120000_harden_rls_rpcs_and_voting`) :
-- sans ce grant, la policy `lists_owner_all` ne suffit pas et la bascule
-- échoue en `permission denied`.
grant update (is_public) on public.lists to authenticated;

-- Le sitemap lit l''index seul : quelques milliers de codes publics triés par
-- fraîcheur, sans toucher aux listes privées.
create index if not exists lists_public_updated_at_idx
  on public.lists (updated_at desc)
  where is_public;

-- ─── APERÇU PARTAGÉ ──────────────────────────────────────────
-- Le type de retour change (`is_public` ajouté) : suppression avant
-- recréation. La page `/l/<code>` s'en sert pour se présenter sans son
-- propriétaire quand la liste est publique.
drop function if exists public.list_by_share_token(text);
create function public.list_by_share_token(p_token text)
  returns table (
    id uuid,
    name text,
    is_collaborative boolean,
    owner_pseudo text,
    restaurant_count int,
    share_code text,
    is_public boolean
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select
    l.id,
    l.name,
    l.is_collaborative,
    p.pseudo,
    (select count(*)::int from public.list_restaurants lr where lr.list_id = l.id),
    l.share_code,
    l.is_public
  from public.find_list_by_share(p_token) l
  join public.profiles p on p.id = l.owner_id
  where l.id is not null;
$$;

-- ─── LECTURE PUBLIQUE ────────────────────────────────────────
-- `security definer` : le rôle `anon` ne voit aucune ligne de `lists` sous
-- RLS, c'est cette fonction — et son `where l.is_public` — qui décide de ce
-- qui sort.
--
-- « Le plus souvent choisi » se lit dans les sessions closes du propriétaire,
-- restreintes aux restaurants de cette liste : c'est l'habitude du groupe,
-- ce qui fait justement l'intérêt de la page. Il n'en sort qu'un nom de
-- restaurant et un compteur — jamais une session, jamais un participant,
-- jamais un vote. Le classement est celui de `session_results` : score, puis
-- coups de cœur en cas d'égalité, et un score nul ne fait pas un gagnant.
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
      coalesce(sum(v.value), 0) as score,
      rank() over (
        partition by s.id
        order by coalesce(sum(v.value), 0) desc,
                 count(*) filter (where v.value = 2) desc
      ) as rank_in_session
    from target t
    join public.sessions s
      on s.host_id = t.owner_id
     and s.status = 'closed'
    join public.session_restaurants sr on sr.session_id = s.id
    left join public.votes v on v.session_restaurant_id = sr.id
    group by s.id, sr.id, sr.restaurant_id
  ),
  champion as (
    select r.name, count(*)::int as wins
    from ranked
    join target t on true
    join public.list_restaurants lr
      on lr.list_id = t.id
     and lr.restaurant_id = ranked.restaurant_id
    join public.restaurants r on r.id = ranked.restaurant_id
    where ranked.rank_in_session = 1
      and ranked.score > 0
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

comment on function public.public_list(text) is
  'Carte de visite d''une liste publique : nom, compteurs, cuisines et '
  'restaurant le plus souvent choisi. N''expose jamais le propriétaire.';

-- Le contenu d'une liste publique. `restaurants` est déjà lisible par `anon`
-- (`restaurants_select_public`) : ce qui se décide ici, c'est l'appartenance
-- à la liste, et elle ne sort que si la liste est publique.
create or replace function public.public_list_restaurants(p_code text)
  returns setof public.restaurants
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select r.*
  from public.find_list_by_share(p_code) l
  join public.list_restaurants lr on lr.list_id = l.id
  join public.restaurants r on r.id = lr.restaurant_id
  where l.id is not null
    and l.is_public
  order by lr.added_at asc, r.name asc;
$$;

-- Les URL du sitemap. Rien d'autre que le code et la date : de quoi écrire
-- `<loc>` et `<lastmod>`, pas de quoi deviner qui les tient.
create or replace function public.public_lists()
  returns table (
    share_code text,
    updated_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select l.share_code, l.updated_at
  from public.lists l
  where l.is_public
  order by l.updated_at desc
  limit 5000;
$$;

comment on function public.public_lists() is
  'Codes de partage des listes publiques, pour le sitemap. Une liste privée '
  'n''en sort jamais.';

-- ─── GRANTS ──────────────────────────────────────────────────
revoke execute on function public.list_by_share_token(text) from public;
grant execute on function public.list_by_share_token(text) to anon, authenticated;

-- Les trois lectures ouvertes à `anon` : c'est tout l'objet de la page publique.
revoke execute on function public.public_list(text) from public;
grant execute on function public.public_list(text) to anon, authenticated;

revoke execute on function public.public_list_restaurants(text) from public;
grant execute on function public.public_list_restaurants(text) to anon, authenticated;

revoke execute on function public.public_lists() from public;
grant execute on function public.public_lists() to anon, authenticated;
