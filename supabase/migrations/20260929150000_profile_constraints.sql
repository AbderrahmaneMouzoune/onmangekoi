-- ============================================================
-- onmangekoi — contraintes alimentaires déclarées par chacun
-- ============================================================
-- Issue #60. Un veto dépensé pour dire « je ne peux pas manger là » est un
-- joker gâché : ce n'est pas une préférence, c'est une contrainte, et elle
-- ne change pas d'un midi à l'autre. Chacun la déclare donc une fois pour
-- toutes, depuis `/account`, et la session la signale d'elle-même.
--
-- Principes :
--   * Deux tables, toutes deux en RLS propriétaire stricte :
--       - `profile_constraints (profile_id, tag)` — les régimes exigés,
--         pris dans la liste blanche de #4 (`restaurant_tag_values()`) ;
--       - `profile_budgets (profile_id, max_price_level)` — le budget
--         maximum, de 1 à 4.
--     Le budget ne va PAS dans `profiles` : la policy
--     `profiles_select_co_participants` rend chaque profil lisible par ceux
--     qui partagent une session avec lui (c'est ce qui affiche les pseudos).
--     Une colonne de plus y serait lue par toute la salle.
--   * L'écriture passe par `save_my_constraints`, qui remplace l'ensemble en
--     une transaction : cocher, décocher, tout vider — c'est toujours le même
--     geste, et il est réversible. Aucune contrainte n'est obligatoire.
--   * Une seule règle dit si un resto « heurte » une personne :
--     `restaurant_conflicts_with()`. Elle se tait dès que la donnée manque :
--       - régime : on ne signale que si le resto a déclaré ses régimes
--         (`tags` non vide) et que le régime exigé n'y est pas. Un resto
--         vegan sert végétarien : `vegan` couvre `vegetarian`. Des `tags`
--         vides veulent dire « on ne sait pas », jamais « aucun régime » —
--         on ne compte rien plutôt que de rassurer à tort.
--       - budget : on ne signale que si `price_level` est renseigné et
--         dépasse le budget maximum. Un prix inconnu ne compte pas.
--     `src/domain/food-constraints.ts` en est l'équivalent pur, pour
--     l'écran de composition, où seules ses propres contraintes comptent.
--   * Personne ne lit la contrainte d'un autre. L'agrégat par session passe
--     par `session_constraint_conflicts`, réservée aux participants, qui ne
--     renvoie qu'un **compte** par resto : « 2 participants ne peuvent pas y
--     manger », jamais qui ni pourquoi. À deux participants, le compte peut
--     trahir l'autre — l'issue l'accepte ; l'interface, elle, ne met jamais
--     un nom à côté.
--   * On signale, on ne masque pas, on n'interdit pas : aucune RPC de
--     création, de lancement ou de vote ne lit ces tables.
--   * RGPD : l'export liste les contraintes ; la suppression du compte les
--     emporte en cascade avec le profil (la purge des anonymes aussi).
-- ============================================================

-- ─── TABLES ──────────────────────────────────────────────────
create table public.profile_constraints (
  profile_id uuid        not null references public.profiles (id) on delete cascade,
  tag        text        not null
    constraint profile_constraints_tag_check
    check (tag = any (public.restaurant_tag_values())),
  created_at timestamptz not null default now(),
  primary key (profile_id, tag)
);

comment on table public.profile_constraints is
  'Régimes exigés par une personne (issue #60), parmi restaurant_tag_values(). Lisibles par '
  'leur seul propriétaire ; écrits par save_my_constraints ; agrégés en comptes par '
  'session_constraint_conflicts.';

create table public.profile_budgets (
  profile_id      uuid        primary key references public.profiles (id) on delete cascade,
  max_price_level smallint    not null
    constraint profile_budgets_max_price_level_check
    check (max_price_level between 1 and 4),
  updated_at      timestamptz not null default now()
);

comment on table public.profile_budgets is
  'Budget maximum d''une personne (issue #60), de 1 (€) à 4 (€€€€). Hors de profiles, que '
  'les co-participants peuvent lire. Même régime que profile_constraints.';

alter table public.profile_constraints enable row level security;
alter table public.profile_budgets enable row level security;

-- Lecture et retrait : les siennes, rien d'autre. L'écriture passe par la RPC.
revoke all on public.profile_constraints from public, anon, authenticated;
revoke all on public.profile_budgets from public, anon, authenticated;
grant select, delete on public.profile_constraints to authenticated;
grant select, delete on public.profile_budgets to authenticated;

create policy "profile_constraints_select_own"
  on public.profile_constraints for select
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy "profile_constraints_delete_own"
  on public.profile_constraints for delete
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy "profile_budgets_select_own"
  on public.profile_budgets for select
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy "profile_budgets_delete_own"
  on public.profile_budgets for delete
  to authenticated
  using ((select auth.uid()) = profile_id);

-- ─── LA RÈGLE ────────────────────────────────────────────────
-- Vrai quand le resto heurte au moins une des contraintes données. Les
-- niveaux de prix sont des `integer` : un `smallint` s'y convertit seul, un
-- littéral aussi, et l'appel reste lisible. Pure :
-- elle ne lit rien d'autre que ses arguments, et ne dit donc rien de qui
-- que ce soit — seule la RPC d'agrégat sait à qui l'appliquer.
create or replace function public.restaurant_conflicts_with(
  p_restaurant_tags  text[],
  p_price_level      integer,
  p_constraint_tags  text[],
  p_max_price_level  integer
)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select
    (
      -- Régimes : seulement quand le resto a dit ce qu'il sert.
      cardinality(coalesce(p_restaurant_tags, '{}'::text[])) > 0
      and exists (
        select 1
        from unnest(coalesce(p_constraint_tags, '{}'::text[])) as wanted
        where not (
          wanted = any (p_restaurant_tags)
          -- Qui sert vegan sert végétarien.
          or (wanted = 'vegetarian' and 'vegan' = any (p_restaurant_tags))
        )
      )
    )
    or (
      -- Budget : seulement quand le prix est connu.
      p_price_level is not null
      and p_max_price_level is not null
      and p_price_level > p_max_price_level
    );
$$;

-- ─── ÉCRITURE ────────────────────────────────────────────────
-- Remplace les contraintes de l'appelant par celles données. `p_tags` vide
-- et `p_max_price_level` nul reviennent à tout retirer : déclarer reste
-- facultatif, et revenir en arrière ne demande rien de plus.
create or replace function public.save_my_constraints(
  p_tags            text[] default null,
  p_max_price_level smallint default null
)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tags text[];
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    perform public.raise_omk('profile_incomplete');
  end if;
  -- Un régime inconnu est une faute du client, pas une donnée à ignorer.
  if not public.is_restaurant_tags(p_tags) then
    perform public.raise_omk('invalid_tags');
  end if;
  if p_max_price_level is not null and p_max_price_level not between 1 and 4 then
    perform public.raise_omk('invalid_price_level');
  end if;

  v_tags := public.normalize_restaurant_tags(p_tags);

  delete from public.profile_constraints pc
  where pc.profile_id = v_uid
    and pc.tag <> all (v_tags);

  insert into public.profile_constraints (profile_id, tag)
  select v_uid, tag
  from unnest(v_tags) as tag
  on conflict (profile_id, tag) do nothing;

  if p_max_price_level is null then
    delete from public.profile_budgets where profile_id = v_uid;
  else
    insert into public.profile_budgets (profile_id, max_price_level)
    values (v_uid, p_max_price_level)
    on conflict (profile_id) do update
      set max_price_level = excluded.max_price_level,
          updated_at = now();
  end if;
end;
$$;

-- ─── AGRÉGAT PAR SESSION ─────────────────────────────────────
-- Pour chaque resto de la session que heurte au moins un participant : le
-- nombre de participants concernés. Rien d'autre — ni qui, ni quelle
-- contrainte. Les restos sans conflit n'apparaissent pas.
--
-- `security definer` : c'est la seule façon de lire les contraintes des
-- autres, et la raison pour laquelle la fonction ne rend qu'un compte.
-- Réservée aux participants : un inconnu n'apprend rien d'une session.
-- Les participations détachées (compte supprimé) ne comptent plus.
create or replace function public.session_constraint_conflicts(p_session_id uuid)
  returns table (restaurant_id uuid, blocked_count integer)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not public.is_session_participant(p_session_id) then
    perform public.raise_omk('not_participant');
  end if;

  return query
  with people as (
    select
      sp.profile_id,
      coalesce(
        (select array_agg(pc.tag) from public.profile_constraints pc
         where pc.profile_id = sp.profile_id),
        '{}'::text[]
      ) as tags,
      (select pb.max_price_level from public.profile_budgets pb
       where pb.profile_id = sp.profile_id) as max_price_level
    from public.session_participants sp
    where sp.session_id = p_session_id
      and sp.profile_id is not null
  )
  select sr.restaurant_id, count(distinct p.profile_id)::integer
  from public.session_restaurants sr
  join public.restaurants r on r.id = sr.restaurant_id
  join people p
    on (cardinality(p.tags) > 0 or p.max_price_level is not null)
   and public.restaurant_conflicts_with(r.tags, r.price_level, p.tags, p.max_price_level)
  where sr.session_id = p_session_id
  group by sr.restaurant_id;
end;
$$;

-- ─── EXPORT RGPD ─────────────────────────────────────────────
-- Corps repris tel quel de `20260929140000_push_notifications.sql`, avec
-- les contraintes alimentaires en plus.
create or replace function public.export_my_data()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_export jsonb;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;

  select jsonb_build_object(
    'format_version', 1,
    'exported_at', now(),

    'account', (
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'is_anonymous', u.is_anonymous,
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at
      )
      from auth.users u
      where u.id = v_uid
    ),

    'profile', (
      select jsonb_build_object(
        'pseudo', p.pseudo,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      from public.profiles p
      where p.id = v_uid
    ),

    -- Ce que la personne a déclaré ne pas pouvoir manger (#60). Toujours
    -- présent, vide quand rien n'est déclaré : l'absence se lit aussi.
    'food_constraints', jsonb_build_object(
      'tags', coalesce((
        select jsonb_agg(pc.tag order by pc.tag)
        from public.profile_constraints pc
        where pc.profile_id = v_uid
      ), '[]'::jsonb),
      'max_price_level', (
        select pb.max_price_level
        from public.profile_budgets pb
        where pb.profile_id = v_uid
      )
    ),

    -- Restos ajoutés à la base par cette personne. La ligne reste en base
    -- après suppression du compte — `created_by` est simplement détaché — mais
    -- tant que le compte existe, le lien est une donnée la concernant.
    'contributed_restaurants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'cuisine_type', r.cuisine_type,
          'address', r.address,
          'city', r.city,
          'price_level', r.price_level,
          'source', r.source,
          'created_at', r.created_at
        )
        order by r.created_at
      )
      from public.restaurants r
      where r.created_by = v_uid
    ), '[]'::jsonb),

    'lists', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'name', l.name,
          'is_collaborative', l.is_collaborative,
          'share_code', l.share_code,
          'created_at', l.created_at,
          'restaurants', coalesce((
            select jsonb_agg(
              jsonb_build_object('id', r.id, 'name', r.name, 'added_at', lr.added_at)
              order by lr.added_at
            )
            from public.list_restaurants lr
            join public.restaurants r on r.id = lr.restaurant_id
            where lr.list_id = l.id
          ), '[]'::jsonb)
        )
        order by l.created_at
      )
      from public.lists l
      where l.owner_id = v_uid
    ), '[]'::jsonb),

    'groups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'is_owner', g.owner_id = v_uid,
          'joined_at', gm.added_at,
          'member_count',
            (select count(*) from public.group_members m where m.group_id = g.id)
        )
        order by gm.added_at
      )
      from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where gm.profile_id = v_uid
    ), '[]'::jsonb),

    'pending_invitations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'session_id', s.id,
          'session_name', s.name,
          'invited_at', si.invited_at
        )
        order by si.invited_at
      )
      from public.session_invitations si
      join public.sessions s on s.id = si.session_id
      where si.profile_id = v_uid
    ), '[]'::jsonb),

    -- Les navigateurs abonnés aux notifications. Les clés de chiffrement
    -- restent en base : ce sont des clés techniques, pas une donnée sur la
    -- personne, et un fichier d'export n'a pas à les promener.
    'push_subscriptions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'endpoint', ps.endpoint,
          'created_at', ps.created_at
        )
        order by ps.created_at
      )
      from public.push_subscriptions ps
      where ps.user_id = v_uid
    ), '[]'::jsonb),

    'hosted_sessions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'status', s.status,
          'invite_code', s.invite_code,
          'rules', s.rules,
          'created_at', s.created_at,
          'launched_at', s.launched_at,
          'closes_at', s.closes_at,
          'closed_at', s.closed_at,
          'participant_count',
            (select count(*) from public.session_participants sp where sp.session_id = s.id)
        )
        order by s.created_at
      )
      from public.sessions s
      where s.host_id = v_uid
    ), '[]'::jsonb),

    'participations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'session_id', s.id,
          'session_name', s.name,
          'status', s.status,
          'is_host', s.host_id = v_uid,
          'joined_at', sp.joined_at,
          'has_finished_voting', sp.has_finished_voting,
          -- Les restos que cette personne a apportés à cette session-là.
          'restaurants_added', coalesce((
            select jsonb_agg(
              jsonb_build_object('name', r.name, 'added_at', sr.added_at)
              order by sr.added_at
            )
            from public.session_restaurants sr
            join public.restaurants r on r.id = sr.restaurant_id
            where sr.session_id = s.id
              and sr.added_by = v_uid
          ), '[]'::jsonb),
          'votes', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'restaurant', r.name,
                'value', v.value,
                'label', case v.value
                  when 2 then 'coup de cœur'
                  when 1 then 'ça me va'
                  when 0 then 'bof'
                  when -2 then 'veto'
                end,
                'created_at', v.created_at
              )
              order by v.created_at
            )
            from public.votes v
            join public.session_restaurants sr on sr.id = v.session_restaurant_id
            join public.restaurants r on r.id = sr.restaurant_id
            where v.participant_id = sp.id
          ), '[]'::jsonb)
        )
        order by sp.joined_at
      )
      from public.session_participants sp
      join public.sessions s on s.id = sp.session_id
      where sp.profile_id = v_uid
    ), '[]'::jsonb)
  )
  into v_export;

  return v_export;
end;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
-- `restaurant_conflicts_with` reste exécutable par tous, comme
-- `is_restaurant_tags` : pure, elle ne lit que ses arguments.
revoke execute on function public.save_my_constraints(text[], smallint) from public, anon;
grant execute on function public.save_my_constraints(text[], smallint) to authenticated;

revoke execute on function public.session_constraint_conflicts(uuid) from public, anon;
grant execute on function public.session_constraint_conflicts(uuid) to authenticated;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
