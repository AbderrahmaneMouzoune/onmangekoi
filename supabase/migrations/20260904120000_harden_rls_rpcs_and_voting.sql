-- ============================================================
-- onmangekoi — harden RLS, RPC surface, voting & results
-- ============================================================
-- Principes :
--   * Aucune table n'est lisible en `using (true)` : les tokens et codes
--     d'invitation ne se résolvent que via des fonctions `security definer`
--     qui prennent le secret en argument et ne renvoient que la ligne visée.
--   * Toutes les écritures métier (créer/rejoindre/lancer/voter/clôturer)
--     passent par des RPC qui vérifient les règles en base, pas seulement
--     côté application.
--   * `auth.uid()` est toujours encapsulé dans `(select auth.uid())` pour
--     être évalué une fois par requête et non par ligne.
--   * Les erreurs métier sont levées avec un message préfixé `omk:` que
--     l'application traduit ; tout autre message est considéré technique.
-- ============================================================

-- ─── EXTENSIONS ──────────────────────────────────────────────
create extension if not exists pg_trgm with schema extensions;

-- ─── PROFILES ────────────────────────────────────────────────
-- Le pseudo devient nullable : NULL = onboarding non terminé.
-- On abandonne la sentinelle « Anonyme » (valeur saisissable par l'utilisateur).
alter table public.profiles
  alter column pseudo drop not null;

update public.profiles
  set pseudo = null
  where pseudo = 'Anonyme';

alter table public.profiles
  add constraint profiles_pseudo_length
  check (pseudo is null or char_length(btrim(pseudo)) between 2 and 30);

-- Le trigger de création de profil lit le pseudo passé en metadata au sign-in
-- (signInAnonymously({ options: { data: { pseudo } } })) et tolère son absence.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_pseudo text := nullif(btrim(new.raw_user_meta_data ->> 'pseudo'), '');
begin
  if v_pseudo is not null and char_length(v_pseudo) not between 2 and 30 then
    v_pseudo := null;
  end if;

  insert into public.profiles (id, pseudo)
  values (new.id, v_pseudo)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ─── SESSIONS / LISTS : contraintes de longueur ──────────────
alter table public.sessions
  add constraint sessions_name_length check (char_length(btrim(name)) between 1 and 100);

alter table public.lists
  add constraint lists_name_length check (char_length(btrim(name)) between 1 and 60);

-- ─── REALTIME : DELETE filtrables par session_id ─────────────
-- Sans REPLICA IDENTITY FULL, un événement DELETE ne transporte que la clé
-- primaire et le filtre `session_id=eq.<id>` ne matche jamais.
alter table public.session_participants replica identity full;

-- ─── INDEX MANQUANTS SUR LES CLÉS ÉTRANGÈRES ─────────────────
create index if not exists idx_lists_owner_id
  on public.lists (owner_id);
create index if not exists idx_list_restaurants_restaurant_id
  on public.list_restaurants (restaurant_id);
create index if not exists idx_sessions_host_id
  on public.sessions (host_id);
create index if not exists idx_session_participants_profile_id
  on public.session_participants (profile_id);
create index if not exists idx_session_restaurants_restaurant_id
  on public.session_restaurants (restaurant_id);
create index if not exists idx_votes_session_id
  on public.votes (session_id);
create index if not exists idx_votes_session_restaurant_id
  on public.votes (session_restaurant_id);
create index if not exists idx_restaurants_name_trgm
  on public.restaurants using gin (name extensions.gin_trgm_ops);

-- ─── HELPERS (security definer, utilisés par les policies) ───
-- Ils lisent session_participants sans déclencher la RLS de cette même
-- table, ce qui évite la récursion infinie d'une policy auto-référente.

create or replace function public.is_session_participant(p_session_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.session_participants sp
    where sp.session_id = p_session_id
      and sp.profile_id = (select auth.uid())
  );
$$;

create or replace function public.is_session_host(p_session_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and s.host_id = (select auth.uid())
  );
$$;

create or replace function public.shares_session_with(p_profile_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.session_participants mine
    join public.session_participants theirs
      on theirs.session_id = mine.session_id
    where mine.profile_id = (select auth.uid())
      and theirs.profile_id = p_profile_id
  );
$$;

-- ─── CODE D'INVITATION ───────────────────────────────────────
-- 6 caractères sur un alphabet de 32 symboles sans ambiguïté (ni 0/O ni 1/I),
-- 256 % 32 = 0 donc le tirage par octet est uniforme. Réessaie en cas de
-- collision au lieu de laisser remonter une violation d'unicité.
create or replace function public.generate_invite_code()
  returns text
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
  i int;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.sessions where invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

alter table public.sessions
  alter column invite_code set default public.generate_invite_code();

-- ─── ERREURS MÉTIER ──────────────────────────────────────────
create or replace function public.raise_omk(p_code text)
  returns void
  language plpgsql
  immutable
  set search_path = ''
as $$
begin
  raise exception 'omk:%', p_code using errcode = 'P0001';
end;
$$;

-- ─── SUPPRESSION DES ANCIENNES POLICIES ──────────────────────
drop policy if exists "profiles: own row select" on public.profiles;
drop policy if exists "profiles: own row update" on public.profiles;
drop policy if exists "profiles: authenticated read all" on public.profiles;

drop policy if exists "restaurants: public read" on public.restaurants;

drop policy if exists "lists: owner full access" on public.lists;
drop policy if exists "lists: share_token read" on public.lists;

drop policy if exists "list_restaurants: owner of list full access" on public.list_restaurants;
drop policy if exists "list_restaurants: collaborative list insert" on public.list_restaurants;
drop policy if exists "list_restaurants: public read via list" on public.list_restaurants;

drop policy if exists "sessions: host full access" on public.sessions;
drop policy if exists "sessions: invite_token join (insert participant)" on public.sessions;
drop policy if exists "sessions: participants read" on public.sessions;

drop policy if exists "session_restaurants: host can manage" on public.session_restaurants;
drop policy if exists "session_restaurants: participants read" on public.session_restaurants;

drop policy if exists "session_participants: own row full access" on public.session_participants;
drop policy if exists "session_participants: host reads all in session" on public.session_participants;
drop policy if exists "session_participants: co-participants read" on public.session_participants;

drop policy if exists "votes: own row full access" on public.votes;
drop policy if exists "votes: readable by all after session closed" on public.votes;

-- ─── NOUVELLES POLICIES ──────────────────────────────────────

-- profiles : soi-même + les personnes avec qui on partage une session
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_select_co_participants"
  on public.profiles for select
  to authenticated
  using (public.shares_session_with(id));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- restaurants : base publique en lecture
create policy "restaurants_select_public"
  on public.restaurants for select
  to anon, authenticated
  using (true);

-- lists : propriétaire uniquement ; le partage passe par RPC
create policy "lists_owner_all"
  on public.lists for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "list_restaurants_owner_all"
  on public.list_restaurants for all
  to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_restaurants.list_id
        and l.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.lists l
      where l.id = list_restaurants.list_id
        and l.owner_id = (select auth.uid())
    )
  );

-- sessions : lisible par ses participants (le host en est un), supprimable par le host
create policy "sessions_select_participant"
  on public.sessions for select
  to authenticated
  using (public.is_session_participant(id));

create policy "sessions_delete_host"
  on public.sessions for delete
  to authenticated
  using ((select auth.uid()) = host_id);

-- session_restaurants : lisible par les participants
create policy "session_restaurants_select_participant"
  on public.session_restaurants for select
  to authenticated
  using (public.is_session_participant(session_id));

-- session_participants : co-participants se voient ; on peut quitter une salle d'attente
create policy "session_participants_select_co"
  on public.session_participants for select
  to authenticated
  using (public.is_session_participant(session_id));

create policy "session_participants_delete_own_waiting"
  on public.session_participants for delete
  to authenticated
  using (
    profile_id = (select auth.uid())
    and exists (
      select 1 from public.sessions s
      where s.id = session_participants.session_id
        and s.status = 'waiting'
        and s.host_id <> (select auth.uid())
    )
  );

-- votes : chacun ne lit que les siens ; le classement passe par RPC agrégée
create policy "votes_select_own"
  on public.votes for select
  to authenticated
  using (
    exists (
      select 1 from public.session_participants sp
      where sp.id = votes.participant_id
        and sp.profile_id = (select auth.uid())
    )
  );

-- ─── GRANTS (Data API) ───────────────────────────────────────
-- Les écritures sensibles n'ont plus de privilège direct : RPC uniquement.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (pseudo) on public.profiles to authenticated;

revoke all on public.lists from anon, authenticated;
grant select, insert, delete on public.lists to authenticated;
grant update (name, is_collaborative) on public.lists to authenticated;

revoke all on public.list_restaurants from anon, authenticated;
grant select, insert, delete on public.list_restaurants to authenticated;

revoke all on public.sessions from anon, authenticated;
grant select, delete on public.sessions to authenticated;

revoke all on public.session_restaurants from anon, authenticated;
grant select on public.session_restaurants to authenticated;

revoke all on public.session_participants from anon, authenticated;
grant select, delete on public.session_participants to authenticated;

revoke all on public.votes from anon, authenticated;
grant select on public.votes to authenticated;

-- ─── RPC : SESSIONS ──────────────────────────────────────────

-- Crée la session, ses restaurants et le participant host dans une seule
-- transaction. Dédoublonne les restaurants en conservant l'ordre.
create or replace function public.create_session(p_name text, p_restaurant_ids uuid[])
  returns public.sessions
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(p_name);
  v_ids uuid[];
  v_session public.sessions;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and pseudo is not null) then
    perform public.raise_omk('profile_incomplete');
  end if;
  if v_name is null or char_length(v_name) not between 1 and 100 then
    perform public.raise_omk('invalid_name');
  end if;

  select array_agg(x.id order by x.ord)
    into v_ids
  from (
    select distinct on (r.id) r.id, t.ord
    from unnest(coalesce(p_restaurant_ids, '{}'::uuid[])) with ordinality as t(id, ord)
    join public.restaurants r on r.id = t.id
    order by r.id, t.ord
  ) x;

  if v_ids is null or array_length(v_ids, 1) < 1 then
    perform public.raise_omk('no_restaurants');
  end if;
  if array_length(v_ids, 1) > 100 then
    perform public.raise_omk('too_many_restaurants');
  end if;

  insert into public.sessions (name, host_id, invite_code)
  values (v_name, v_uid, public.generate_invite_code())
  returning * into v_session;

  insert into public.session_restaurants (session_id, restaurant_id, position)
  select v_session.id, t.id, (t.ord - 1)::int
  from unnest(v_ids) with ordinality as t(id, ord);

  insert into public.session_participants (session_id, profile_id)
  values (v_session.id, v_uid);

  return v_session;
end;
$$;

-- Rejoint une session par code court (6 caractères) ou token long (32 hex).
-- Idempotent : un participant existant récupère la session quel que soit son statut.
create or replace function public.join_session(p_identifier text)
  returns public.sessions
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ident text := upper(btrim(coalesce(p_identifier, '')));
  v_session public.sessions;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and pseudo is not null) then
    perform public.raise_omk('profile_incomplete');
  end if;

  if v_ident ~ '^[A-Z0-9]{6}$' then
    select * into v_session from public.sessions where invite_code = v_ident;
  elsif v_ident ~ '^[A-F0-9]{32}$' then
    select * into v_session from public.sessions where invite_token = lower(v_ident);
  else
    perform public.raise_omk('invalid_identifier');
  end if;

  if v_session.id is null then
    perform public.raise_omk('session_not_found');
  end if;

  if exists (
    select 1 from public.session_participants
    where session_id = v_session.id and profile_id = v_uid
  ) then
    return v_session;
  end if;

  if v_session.status = 'voting' then
    perform public.raise_omk('session_started');
  end if;
  if v_session.status = 'closed' then
    perform public.raise_omk('session_closed');
  end if;

  insert into public.session_participants (session_id, profile_id)
  values (v_session.id, v_uid)
  on conflict (session_id, profile_id) do nothing;

  return v_session;
end;
$$;

-- Aperçu minimal d'une session pour la page d'invitation et les métadonnées
-- Open Graph. Un visiteur non authentifié ne peut prévisualiser que par token
-- long (non devinable) ; le code court reste réservé aux utilisateurs connectés.
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
    select btrim(coalesce(p_identifier, '')) as raw
  )
  select
    s.id,
    s.name,
    s.status,
    p.pseudo,
    (select count(*)::int from public.session_participants sp where sp.session_id = s.id),
    (select count(*)::int from public.session_restaurants sr where sr.session_id = s.id)
  from ident, public.sessions s
  join public.profiles p on p.id = s.host_id
  where (
      lower(ident.raw) ~ '^[a-f0-9]{32}$'
      and s.invite_token = lower(ident.raw)
    )
    or (
      (select auth.uid()) is not null
      and upper(ident.raw) ~ '^[A-Z0-9]{6}$'
      and s.invite_code = upper(ident.raw)
    );
$$;

-- Lance le vote. Réservé au host, exige au moins 2 participants.
create or replace function public.launch_session(p_session_id uuid)
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

  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    perform public.raise_omk('session_not_found');
  end if;
  if v_session.host_id <> v_uid then
    perform public.raise_omk('host_only');
  end if;
  if v_session.status <> 'waiting' then
    perform public.raise_omk('session_already_started');
  end if;
  if (select count(*) from public.session_participants where session_id = p_session_id) < 2 then
    perform public.raise_omk('not_enough_participants');
  end if;
  if not exists (select 1 from public.session_restaurants where session_id = p_session_id) then
    perform public.raise_omk('no_restaurants');
  end if;

  update public.sessions
    set status = 'voting', launched_at = now()
    where id = p_session_id
    returning * into v_session;

  return v_session;
end;
$$;

-- Clôture forcée par le host. Les votes manquants comptent 0 dans le classement.
create or replace function public.close_session(p_session_id uuid)
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

  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    perform public.raise_omk('session_not_found');
  end if;
  if v_session.host_id <> v_uid then
    perform public.raise_omk('host_only');
  end if;
  if v_session.status = 'closed' then
    return v_session;
  end if;
  if v_session.status <> 'voting' then
    perform public.raise_omk('session_not_voting');
  end if;

  update public.sessions
    set status = 'closed', closed_at = now()
    where id = p_session_id
    returning * into v_session;

  return v_session;
end;
$$;

-- ─── RPC : VOTE ──────────────────────────────────────────────

-- Enregistre un vote. Vérifie en base : session en cours, participant,
-- restaurant de la session, valeur autorisée, joker disponible. Idempotent
-- pour un double envoi identique ; refuse un changement de vote.
-- Verrouille la ligne participant pour sérialiser deux jokers concurrents.
create or replace function public.submit_vote(
  p_session_id uuid,
  p_session_restaurant_id uuid,
  p_value smallint
)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_participant public.session_participants;
  v_existing smallint;
  v_total int;
  v_voted int;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if p_value is null or p_value not in (-2, 0, 1, 2) then
    perform public.raise_omk('invalid_vote');
  end if;

  select * into v_session from public.sessions where id = p_session_id;
  if v_session.id is null then
    perform public.raise_omk('session_not_found');
  end if;
  if v_session.status <> 'voting' then
    perform public.raise_omk('session_not_voting');
  end if;

  select * into v_participant
  from public.session_participants
  where session_id = p_session_id and profile_id = v_uid
  for update;

  if v_participant.id is null then
    perform public.raise_omk('not_participant');
  end if;
  if v_participant.has_finished_voting then
    perform public.raise_omk('already_finished');
  end if;
  if not exists (
    select 1 from public.session_restaurants
    where id = p_session_restaurant_id and session_id = p_session_id
  ) then
    perform public.raise_omk('invalid_restaurant');
  end if;

  select value into v_existing
  from public.votes
  where participant_id = v_participant.id
    and session_restaurant_id = p_session_restaurant_id;

  if found then
    if v_existing = p_value then
      return;
    end if;
    perform public.raise_omk('already_voted');
  end if;

  if p_value = 2 then
    if v_participant.superlike_used then
      perform public.raise_omk('superlike_used');
    end if;
    update public.session_participants
      set superlike_used = true
      where id = v_participant.id;
  elsif p_value = -2 then
    if v_participant.super_dislike_used then
      perform public.raise_omk('super_dislike_used');
    end if;
    update public.session_participants
      set super_dislike_used = true
      where id = v_participant.id;
  end if;

  insert into public.votes (session_id, participant_id, session_restaurant_id, value)
  values (p_session_id, v_participant.id, p_session_restaurant_id, p_value);

  select count(*) into v_total from public.session_restaurants where session_id = p_session_id;
  select count(*) into v_voted from public.votes where participant_id = v_participant.id;

  if v_voted >= v_total then
    update public.session_participants
      set has_finished_voting = true
      where id = v_participant.id;
  end if;
end;
$$;

-- Clôture automatique : dès que le dernier participant a terminé.
-- Verrouille la session pour que deux « derniers » simultanés se sérialisent.
create or replace function public.handle_participant_finished()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.has_finished_voting and not old.has_finished_voting then
    perform 1 from public.sessions where id = new.session_id for update;

    if not exists (
      select 1 from public.session_participants
      where session_id = new.session_id
        and not has_finished_voting
    ) then
      update public.sessions
        set status = 'closed', closed_at = now()
        where id = new.session_id
          and status = 'voting';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists session_participants_auto_close on public.session_participants;
create trigger session_participants_auto_close
  after update of has_finished_voting on public.session_participants
  for each row execute function public.handle_participant_finished();

-- ─── RPC : RÉSULTATS ─────────────────────────────────────────
-- Classement agrégé : somme des votes, égalité départagée par le nombre de
-- superlikes. Les votes individuels ne sont jamais exposés. Vide tant que la
-- session n'est pas close ou si l'appelant n'y participe pas.
create or replace function public.session_results(p_session_id uuid)
  returns table (
    session_restaurant_id uuid,
    restaurant_id uuid,
    name text,
    cuisine_type text,
    description text,
    image_url text,
    restaurant_position int,
    score int,
    superlikes int,
    likes int,
    dislikes int,
    super_dislikes int,
    votes_count int,
    rank int
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select
    sr.id,
    r.id,
    r.name,
    r.cuisine_type,
    r.description,
    r.image_url,
    sr.position as restaurant_position,
    coalesce(sum(v.value), 0)::int as score,
    (count(*) filter (where v.value = 2))::int as superlikes,
    (count(*) filter (where v.value = 1))::int as likes,
    (count(*) filter (where v.value = 0))::int as dislikes,
    (count(*) filter (where v.value = -2))::int as super_dislikes,
    count(v.id)::int as votes_count,
    (rank() over (
      order by coalesce(sum(v.value), 0) desc,
               count(*) filter (where v.value = 2) desc
    ))::int as rank
  from public.session_restaurants sr
  join public.restaurants r on r.id = sr.restaurant_id
  left join public.votes v on v.session_restaurant_id = sr.id
  where sr.session_id = p_session_id
    and public.is_session_participant(p_session_id)
    and exists (
      select 1 from public.sessions s
      where s.id = p_session_id and s.status = 'closed'
    )
  group by sr.id, r.id, sr.position
  order by rank, sr.position;
$$;

-- ─── RPC : LISTES PARTAGÉES ──────────────────────────────────

create or replace function public.list_by_share_token(p_token text)
  returns table (
    id uuid,
    name text,
    is_collaborative boolean,
    owner_pseudo text,
    restaurant_count int
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
    (select count(*)::int from public.list_restaurants lr where lr.list_id = l.id)
  from public.lists l
  join public.profiles p on p.id = l.owner_id
  where lower(btrim(coalesce(p_token, ''))) ~ '^[a-f0-9]{32}$'
    and l.share_token = lower(btrim(p_token));
$$;

create or replace function public.list_restaurants_by_share_token(p_token text)
  returns setof public.restaurants
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select r.*
  from public.lists l
  join public.list_restaurants lr on lr.list_id = l.id
  join public.restaurants r on r.id = lr.restaurant_id
  where lower(btrim(coalesce(p_token, ''))) ~ '^[a-f0-9]{32}$'
    and l.share_token = lower(btrim(p_token))
  order by lr.added_at asc, r.name asc;
$$;

-- Ajout à une liste collaborative : le token fait office de droit d'écriture.
create or replace function public.add_restaurant_to_shared_list(p_token text, p_restaurant_id uuid)
  returns void
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_list public.lists;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;

  select * into v_list
  from public.lists
  where lower(btrim(coalesce(p_token, ''))) ~ '^[a-f0-9]{32}$'
    and share_token = lower(btrim(p_token));

  if v_list.id is null then
    perform public.raise_omk('list_not_found');
  end if;
  if not v_list.is_collaborative and v_list.owner_id <> v_uid then
    perform public.raise_omk('list_not_collaborative');
  end if;
  if not exists (select 1 from public.restaurants where id = p_restaurant_id) then
    perform public.raise_omk('invalid_restaurant');
  end if;

  insert into public.list_restaurants (list_id, restaurant_id)
  values (v_list.id, p_restaurant_id)
  on conflict (list_id, restaurant_id) do nothing;
end;
$$;

-- Duplique une liste partagée dans ses propres listes.
create or replace function public.copy_shared_list(p_token text, p_name text default null)
  returns public.lists
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_source public.lists;
  v_copy public.lists;
  v_name text;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;

  select * into v_source
  from public.lists
  where lower(btrim(coalesce(p_token, ''))) ~ '^[a-f0-9]{32}$'
    and share_token = lower(btrim(p_token));

  if v_source.id is null then
    perform public.raise_omk('list_not_found');
  end if;

  v_name := left(btrim(coalesce(nullif(btrim(p_name), ''), v_source.name)), 60);

  insert into public.lists (name, owner_id)
  values (v_name, v_uid)
  returning * into v_copy;

  insert into public.list_restaurants (list_id, restaurant_id)
  select v_copy.id, lr.restaurant_id
  from public.list_restaurants lr
  where lr.list_id = v_source.id;

  return v_copy;
end;
$$;

-- ─── GRANTS SUR LES FONCTIONS ────────────────────────────────
-- Par défaut PostgreSQL accorde EXECUTE à PUBLIC : on ferme, puis on ouvre
-- explicitement ce qui doit l'être.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_participant_finished() from public, anon, authenticated;
revoke execute on function public.generate_invite_code() from public, anon, authenticated;
revoke execute on function public.raise_omk(text) from public, anon, authenticated;

revoke execute on function public.is_session_participant(uuid) from public, anon;
revoke execute on function public.is_session_host(uuid) from public, anon;
revoke execute on function public.shares_session_with(uuid) from public, anon;
grant execute on function public.is_session_participant(uuid) to authenticated;
grant execute on function public.is_session_host(uuid) to authenticated;
grant execute on function public.shares_session_with(uuid) to authenticated;

revoke execute on function public.create_session(text, uuid[]) from public, anon;
revoke execute on function public.join_session(text) from public, anon;
revoke execute on function public.launch_session(uuid) from public, anon;
revoke execute on function public.close_session(uuid) from public, anon;
revoke execute on function public.submit_vote(uuid, uuid, smallint) from public, anon;
revoke execute on function public.session_results(uuid) from public, anon;
revoke execute on function public.add_restaurant_to_shared_list(text, uuid) from public, anon;
revoke execute on function public.copy_shared_list(text, text) from public, anon;
grant execute on function public.create_session(text, uuid[]) to authenticated;
grant execute on function public.join_session(text) to authenticated;
grant execute on function public.launch_session(uuid) to authenticated;
grant execute on function public.close_session(uuid) to authenticated;
grant execute on function public.submit_vote(uuid, uuid, smallint) to authenticated;
grant execute on function public.session_results(uuid) to authenticated;
grant execute on function public.add_restaurant_to_shared_list(text, uuid) to authenticated;
grant execute on function public.copy_shared_list(text, text) to authenticated;

revoke execute on function public.session_preview(text) from public;
revoke execute on function public.list_by_share_token(text) from public;
revoke execute on function public.list_restaurants_by_share_token(text) from public;
grant execute on function public.session_preview(text) to anon, authenticated;
grant execute on function public.list_by_share_token(text) to anon, authenticated;
grant execute on function public.list_restaurants_by_share_token(text) to anon, authenticated;
