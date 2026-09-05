-- ============================================================
-- onmangekoi — RGPD : suppression du compte et export des données
-- ============================================================
-- Principes :
--   * Supprimer un compte ne doit pas réécrire l'histoire des autres :
--     les résultats d'une session close restent lisibles et le classement
--     inchangé. Les votes sont donc conservés, mais détachés de leur auteur.
--   * L'anonymisation est portée par le schéma, pas seulement par la RPC :
--     `session_participants.profile_id` et `sessions.host_id` deviennent
--     nullables et passent en `on delete set null`. Une suppression faite
--     depuis le dashboard Supabase produit le même résultat que la RPC.
--   * Rien n'est laissé en suspens : une session qui ne peut plus aboutir
--     (host parti avant la clôture) est supprimée plutôt que gelée.
--   * L'export est une seule fonction auditable, filtrée sur `auth.uid()`.
-- ============================================================

-- ─── ANONYMISATION : COLONNES NULLABLES ──────────────────────
-- `profile_id` null = « Participant supprimé » : la ligne survit avec ses
-- votes, qui continuent d'alimenter `session_results`.
alter table public.session_participants
  alter column profile_id drop not null;

alter table public.session_participants
  drop constraint session_participants_profile_id_fkey,
  add constraint session_participants_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete set null;

-- `host_id` null = session orpheline : plus personne ne peut la lancer, la
-- clôturer ou la supprimer, mais ses résultats restent consultables.
alter table public.sessions
  alter column host_id drop not null;

alter table public.sessions
  drop constraint sessions_host_id_fkey,
  add constraint sessions_host_id_fkey
    foreign key (host_id) references public.profiles (id) on delete set null;

-- Les policies comparent `host_id` / `profile_id` à `auth.uid()` : une valeur
-- nulle rend la comparaison nulle, donc fausse. Aucune n'ouvre d'accès par
-- l'anonymisation.
--
-- `session_preview` est la seule exception : elle joignait `profiles` en
-- interne, donc une session dont le host a supprimé son compte ne renvoyait
-- plus aucune ligne — ni aperçu, ni page d'erreur nommant la session. La
-- jointure passe en externe et `host_pseudo` devient nul, ce que le type de
-- retour permet déjà. Le reste du corps est repris tel quel de
-- `20260905130000_readable_invite_links.sql` : les règles d'ouverture au
-- visiteur anonyme ne changent pas.
create or replace function public.session_preview(p_identifier text)
  returns table (
    id uuid,
    name text,
    status public.session_status,
    host_pseudo text,
    participant_count int,
    restaurant_count int
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with ident as (
    select
      btrim(coalesce(p_identifier, '')) as raw,
      upper(regexp_replace(btrim(coalesce(p_identifier, '')), '[\s\-_.]+', '', 'g')) as compact
  )
  select
    s.id,
    s.name,
    s.status,
    p.pseudo,
    (select count(*)::int from public.session_participants sp where sp.session_id = s.id),
    (select count(*)::int from public.session_restaurants sr where sr.session_id = s.id)
  from ident, public.sessions s
  left join public.profiles p on p.id = s.host_id
  where (
      lower(ident.raw) ~ '^[a-f0-9]{32}$'
      and s.invite_token = lower(ident.raw)
    )
    or (
      ident.compact ~ '^[A-Z0-9]{6}$'
      and s.invite_code in (ident.compact, public.normalize_crockford(ident.compact))
      -- Connecté : n'importe quel statut (la page d'erreur nomme la session).
      -- Anonyme : uniquement une session encore ouverte aux arrivées.
      and ((select auth.uid()) is not null or s.status = 'waiting')
    );
$$;

-- ─── EXPORT DES DONNÉES ──────────────────────────────────────
-- Portabilité (art. 20 RGPD) : tout ce que la base sait de l'appelant, dans
-- un seul JSON. `security definer` pour lire `auth.users` (email, dates de
-- connexion) que la Data API n'expose pas ; chaque sous-requête est filtrée
-- sur `v_uid`, jamais sur un paramètre.
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

    'hosted_sessions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'status', s.status,
          'invite_code', s.invite_code,
          'created_at', s.created_at,
          'launched_at', s.launched_at,
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

-- ─── SUPPRESSION DU COMPTE ───────────────────────────────────
-- Effacement (art. 17 RGPD) sans casser les sessions des autres :
--   1. sessions hébergées non closes → supprimées (sans host, elles ne
--      peuvent plus être lancées ni clôturées ; aucun résultat n'existe) ;
--   2. participations à des sessions non closes → supprimées avec leurs
--      votes (rien n'est encore agrégé) ;
--   3. participations à des sessions closes → conservées, `profile_id` mis à
--      null : les votes restent dans le classement, l'auteur disparaît ;
--   4. listes → supprimées ;
--   5. sessions en cours vidées ou dont tous les votants restants ont fini →
--      supprimées ou clôturées, pour ne laisser aucune session gelée ;
--   6. profil puis `auth.users`.
create or replace function public.delete_my_account()
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_touched uuid[];
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;

  -- 1. Sessions hébergées qui n'aboutiront jamais.
  delete from public.sessions
  where host_id = v_uid
    and status <> 'closed';

  -- 2. Participations en cours — on note les sessions à réexaminer en 5.
  select coalesce(array_agg(distinct sp.session_id), '{}'::uuid[])
  into v_touched
  from public.session_participants sp
  join public.sessions s on s.id = sp.session_id
  where sp.profile_id = v_uid
    and s.status <> 'closed';

  delete from public.session_participants sp
  using public.sessions s
  where sp.session_id = s.id
    and sp.profile_id = v_uid
    and s.status <> 'closed';

  -- 3. Participations closes : anonymisées, votes conservés.
  update public.session_participants
  set profile_id = null
  where profile_id = v_uid;

  -- Sessions closes hébergées : orphelines mais consultables.
  update public.sessions
  set host_id = null
  where host_id = v_uid;

  -- 4. Listes (les `list_restaurants` suivent par cascade).
  delete from public.lists
  where owner_id = v_uid;

  -- 5. Sessions vidées, puis sessions en vote dont il ne reste que des
  --    votants ayant terminé (le trigger d'auto-clôture ne voit pas les
  --    DELETE : on refait sa vérification ici).
  delete from public.sessions s
  where s.id = any(v_touched)
    and not exists (
      select 1 from public.session_participants sp where sp.session_id = s.id
    );

  update public.sessions s
  set status = 'closed', closed_at = now()
  where s.id = any(v_touched)
    and s.status = 'voting'
    and not exists (
      select 1 from public.session_participants sp
      where sp.session_id = s.id
        and not sp.has_finished_voting
    );

  -- 6. Profil puis compte d'authentification.
  delete from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
-- `delete_my_account` et `export_my_data` touchent `auth.users` : elles
-- doivent appartenir à un rôle autorisé sur ce schéma (`postgres`, qui joue
-- les migrations). Elles n'acceptent aucun paramètre — le périmètre est
-- toujours `auth.uid()`, jamais une valeur venue du client.
revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.export_my_data() to authenticated;
