-- ============================================================
-- onmangekoi — groupes récurrents (« l'équipe du déjeuner »)
-- ============================================================
-- Les mêmes collègues votent chaque midi et retapent le code à chaque
-- session. Un groupe se sauvegarde depuis les résultats, puis se réinvite
-- d'un clic à la création de la session suivante.
--
-- Principes :
--   * `groups` + `group_members` : un propriétaire, des membres. Seuls les
--     membres voient le groupe, seul le propriétaire le renomme ou le
--     supprime — c'est la RLS qui le dit, pas l'interface.
--   * Un groupe se crée **depuis une session vécue** (`create_group_from_session`)
--     et jamais depuis une liste de pseudos : on ne peut pas s'ajouter
--     quelqu'un qu'on n'a pas croisé.
--   * Inviter un groupe **n'ajoute pas de participants** : ça pose des
--     invitations en attente (`session_invitations`). Un invité ne devient
--     participant qu'en ouvrant la session — sinon il compterait dans les
--     « 100 % ont voté » sans jamais voter, et gèlerait le déjeuner.
--     La conversion se fait à un seul endroit : un trigger sur
--     `session_participants` consomme l'invitation, quel que soit le chemin
--     d'entrée (lien, code, QR).
--   * Les invitations suivent la session : elles disparaissent avec elle
--     (cascade) comme avec le compte de l'invité.
-- ============================================================

-- ─── TABLES ──────────────────────────────────────────────────

create table if not exists public.groups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  owner_id    uuid        not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.groups is
  'Groupe récurrent : une équipe qu''on réinvite d''une session à l''autre.';

create trigger groups_updated_at
  before update on public.groups
  for each row execute function public.handle_updated_at();

-- Deux groupes du même nom chez la même personne ne se distinguent pas dans
-- une liste de cases à cocher : l'unicité est posée en base, insensible à la
-- casse, plutôt que laissée à la vigilance de l'interface.
create unique index if not exists idx_groups_owner_name
  on public.groups (owner_id, lower(name));

create table if not exists public.group_members (
  group_id    uuid        not null references public.groups (id) on delete cascade,
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (group_id, profile_id)
);

comment on table public.group_members is
  'Appartenance à un groupe. Quitter = supprimer sa ligne (public.leave_group).';

create index if not exists idx_group_members_profile
  on public.group_members (profile_id);

create table if not exists public.session_invitations (
  session_id  uuid        not null references public.sessions (id) on delete cascade,
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  group_id    uuid        references public.groups (id) on delete set null,
  invited_at  timestamptz not null default now(),
  primary key (session_id, profile_id)
);

comment on table public.session_invitations is
  'Invitation en attente : la personne est attendue, pas encore participante. '
  'Le trigger sur session_participants la consomme dès qu''elle ouvre la session.';

create index if not exists idx_session_invitations_profile
  on public.session_invitations (profile_id);

-- ─── HELPERS (security definer, utilisés par les policies) ───
-- Comme pour les sessions, ils lisent l'appartenance sans déclencher la RLS
-- de la table qu'ils interrogent : une policy auto-référente boucle sinon.

create or replace function public.is_group_member(p_group_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.profile_id = (select auth.uid())
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.owner_id = (select auth.uid())
  );
$$;

-- Pendant exact de `shares_session_with` : on lit le pseudo des gens de ses
-- groupes, sinon la liste des membres s'afficherait vide entre deux sessions.
create or replace function public.shares_group_with(p_profile_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs
      on theirs.group_id = mine.group_id
    where mine.profile_id = (select auth.uid())
      and theirs.profile_id = p_profile_id
  );
$$;

-- ─── RLS ─────────────────────────────────────────────────────

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.session_invitations enable row level security;

-- groups : visible par ses membres, modifiable par son seul propriétaire.
-- La création passe par RPC (il faut recopier les participants dans la même
-- transaction) : aucune policy d'insertion, aucun droit d'insertion.
-- Le propriétaire est membre par construction ; la clause `owner_id` n'est
-- là que pour qu'un groupe ne puisse jamais devenir invisible à qui le tient.
create policy "groups_select_member"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id) or (select auth.uid()) = owner_id);

create policy "groups_update_owner"
  on public.groups for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "groups_delete_owner"
  on public.groups for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- group_members : les membres se voient entre eux. On entre par RPC et on
-- sort par RPC (`leave_group`), qui refuse au propriétaire de laisser son
-- groupe sans chef plutôt que de supprimer zéro ligne en silence.
create policy "group_members_select_member"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

-- session_invitations : l'invité voit les siennes, le host voit celles de sa
-- session. Les deux peuvent les retirer — décliner d'un côté, désinviter de
-- l'autre.
create policy "session_invitations_select_own"
  on public.session_invitations for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "session_invitations_select_host"
  on public.session_invitations for select
  to authenticated
  using (public.is_session_host(session_id));

create policy "session_invitations_delete_own"
  on public.session_invitations for delete
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "session_invitations_delete_host"
  on public.session_invitations for delete
  to authenticated
  using (public.is_session_host(session_id));

-- profiles : on lit aussi le pseudo des membres de ses groupes.
create policy "profiles_select_group_members"
  on public.profiles for select
  to authenticated
  using (public.shares_group_with(id));

-- ─── GRANTS (Data API) ───────────────────────────────────────
-- Écritures sensibles : RPC uniquement. Le renommage, lui, est un update
-- d'une seule colonne, déjà borné par la policy du propriétaire.
revoke all on public.groups from anon, authenticated;
grant select, delete on public.groups to authenticated;
grant update (name) on public.groups to authenticated;

revoke all on public.group_members from anon, authenticated;
grant select on public.group_members to authenticated;

revoke all on public.session_invitations from anon, authenticated;
grant select, delete on public.session_invitations to authenticated;

-- ─── CONVERSION D'UNE INVITATION EN PARTICIPATION ────────────
-- Le seul endroit qui transforme un invité en participant : dès qu'une ligne
-- de participation apparaît — `join_session`, ou n'importe quel chemin futur
-- —, l'invitation correspondante disparaît. Aucun doublon possible, aucune
-- invitation fantôme après coup.
create or replace function public.consume_session_invitation()
  returns trigger
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
begin
  delete from public.session_invitations
  where session_id = new.session_id
    and profile_id = new.profile_id;
  return new;
end;
$$;

create trigger session_participants_consume_invitation
  after insert on public.session_participants
  for each row execute function public.consume_session_invitation();

-- ─── RPC : SAUVEGARDER LE GROUPE D'UNE SESSION ───────────────
-- Recopie les participants d'une session qu'on a vécue. Le propriétaire en
-- fait partie par construction : c'est lui qui déclenche.
create or replace function public.create_group_from_session(
  p_name text,
  p_session_id uuid
)
  returns public.groups
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(p_name);
  v_group public.groups;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and pseudo is not null) then
    perform public.raise_omk('profile_incomplete');
  end if;
  if v_name is null or char_length(v_name) not between 1 and 60 then
    perform public.raise_omk('invalid_group_name');
  end if;
  if not exists (
    select 1 from public.session_participants sp
    where sp.session_id = p_session_id and sp.profile_id = v_uid
  ) then
    perform public.raise_omk('not_participant');
  end if;
  if (select count(*) from public.groups g where g.owner_id = v_uid) >= 20 then
    perform public.raise_omk('too_many_groups');
  end if;
  if exists (
    select 1 from public.groups g
    where g.owner_id = v_uid and lower(g.name) = lower(v_name)
  ) then
    perform public.raise_omk('group_name_taken');
  end if;

  insert into public.groups (name, owner_id)
  values (v_name, v_uid)
  returning * into v_group;

  -- Un participant dont le compte a été supprimé (`profile_id` nul) n'a plus
  -- personne à réinviter : il sort de la copie. Le propriétaire passe en
  -- premier : sur une session à plus de 50 personnes, la coupe ne doit pas
  -- lui prendre sa propre place.
  insert into public.group_members (group_id, profile_id)
  select v_group.id, x.profile_id
  from (
    select sp.profile_id
    from public.session_participants sp
    where sp.session_id = p_session_id
      and sp.profile_id is not null
    order by (sp.profile_id = v_uid) desc, sp.joined_at
    limit 50
  ) x
  on conflict do nothing;

  return v_group;
end;
$$;

-- ─── RPC : INVITER UN GROUPE DANS UNE SESSION ────────────────
-- Renvoie le nombre d'invitations réellement posées : celles et ceux qui
-- sont déjà dans la salle n'en reçoivent pas une deuxième.
create or replace function public.invite_group_to_session(
  p_group_id uuid,
  p_session_id uuid
)
  returns integer
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_invited integer;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;

  select * into v_session from public.sessions where id = p_session_id;
  if v_session.id is null then
    perform public.raise_omk('session_not_found');
  end if;
  -- `is distinct from` et non `<>` : le host d'une session orpheline est nul
  -- (compte supprimé), et une comparaison nulle laisserait passer.
  if v_session.host_id is distinct from v_uid then
    perform public.raise_omk('host_only');
  end if;
  -- Une fois le vote lancé, plus personne ne rejoint : une invitation posée
  -- ici ne mènerait nulle part.
  if v_session.status <> 'waiting' then
    perform public.raise_omk('session_already_started');
  end if;
  -- Un groupe dont on n'est pas membre n'existe pas, de ce côté-ci.
  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.profile_id = v_uid
  ) then
    perform public.raise_omk('group_not_found');
  end if;

  with invited as (
    insert into public.session_invitations (session_id, profile_id, group_id)
    select p_session_id, gm.profile_id, p_group_id
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.profile_id <> v_uid
      and not exists (
        select 1 from public.session_participants sp
        where sp.session_id = p_session_id
          and sp.profile_id = gm.profile_id
      )
    on conflict (session_id, profile_id) do nothing
    returning 1
  )
  select count(*) into v_invited from invited;

  if (select count(*) from public.session_invitations si
      where si.session_id = p_session_id) > 50 then
    perform public.raise_omk('too_many_invitations');
  end if;

  return v_invited;
end;
$$;

-- ─── RPC : QUITTER UN GROUPE ─────────────────────────────────
-- Le propriétaire ne quitte pas son groupe : il le supprime (la suppression
-- passe par la policy `groups_delete_owner`, et les membres suivent en
-- cascade). Sans ce refus explicite, un groupe survivrait sans personne pour
-- le renommer ni le supprimer.
create or replace function public.leave_group(p_group_id uuid)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.owner_id = v_uid
  ) then
    perform public.raise_omk('group_owner_cannot_leave');
  end if;

  delete from public.group_members
  where group_id = p_group_id
    and profile_id = v_uid;

  if not found then
    perform public.raise_omk('group_not_found');
  end if;
end;
$$;

-- ─── RPC : MES INVITATIONS EN ATTENTE ────────────────────────
-- L'invité ne voit pas la session tant qu'il n'y est pas entré (la RLS de
-- `sessions` s'arrête aux participants) : cette fonction lui rend le strict
-- nécessaire pour décider — le nom, qui invite, et le code pour y aller.
-- Seules les sessions encore en attente comptent : une fois le vote lancé,
-- l'invitation ne mène plus nulle part.
create or replace function public.my_session_invitations()
  returns table (
    session_id uuid,
    name text,
    invite_code text,
    host_pseudo text,
    group_name text,
    participant_count int,
    invited_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select
    s.id,
    s.name,
    s.invite_code,
    h.pseudo,
    g.name,
    (select count(*)::int from public.session_participants sp where sp.session_id = s.id),
    si.invited_at
  from public.session_invitations si
  join public.sessions s on s.id = si.session_id
  left join public.profiles h on h.id = s.host_id
  left join public.groups g on g.id = si.group_id
  where si.profile_id = (select auth.uid())
    and s.status = 'waiting'
  order by si.invited_at desc;
$$;

-- ─── EXPORT RGPD ─────────────────────────────────────────────
-- Toute colonne rattachée à `auth.uid()` doit se retrouver dans l'export :
-- les groupes possédés, ceux qu'on a rejoints et les invitations reçues en
-- font désormais partie.
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

    'hosted_sessions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'status', s.status,
          'invite_code', s.invite_code,
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

-- ─── GRANTS (RPC) ────────────────────────────────────────────
-- La suppression de compte n'a rien à apprendre des groupes : `owner_id` et
-- `profile_id` pointent sur `profiles` en `on delete cascade`, donc les
-- groupes possédés, les appartenances et les invitations partent avec le
-- profil.
revoke execute on function public.create_group_from_session(text, uuid) from public, anon;
revoke execute on function public.invite_group_to_session(uuid, uuid) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.my_session_invitations() from public, anon;

grant execute on function public.create_group_from_session(text, uuid) to authenticated;
grant execute on function public.invite_group_to_session(uuid, uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.my_session_invitations() to authenticated;
