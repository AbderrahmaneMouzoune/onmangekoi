-- ============================================================
-- onmangekoi — chacun apporte son resto
-- ============================================================
--   * Le contenu d'une session n'est plus figé à sa création : tant qu'elle
--     est en `waiting`, **n'importe quel participant** peut y ajouter un
--     restaurant. Le figement se fait au lancement, pas avant.
--   * `session_restaurants.added_by` / `added_at` : on sait qui a apporté quoi
--     et quand. Les lignes déjà en base viennent du host, par construction.
--   * Deux RPC portent la règle en base : `add_session_restaurant` (ajout
--     idempotent, position en fin de deck) et `remove_session_restaurant`
--     (chacun retire ce qu'il a apporté, le host peut arbitrer chez lui).
--     Aucune policy RLS n'ouvre l'écriture directe : elles restent le seul
--     chemin, comme pour toutes les écritures de session.
--   * `session_restaurants` rejoint la publication Realtime : la salle
--     d'attente voit arriver les restos des autres sans rechargement.
-- ============================================================

-- ─── COLONNES ────────────────────────────────────────────────
alter table public.session_restaurants
  add column if not exists added_by uuid references public.profiles (id) on delete set null,
  add column if not exists added_at timestamptz not null default now();

-- Reprise de l'historique : avant cette migration, seul le host composait la
-- session. `on delete set null` s'applique ensuite comme pour `host_id` — un
-- compte supprimé laisse le resto dans la session, sans auteur.
update public.session_restaurants sr
  set added_by = s.host_id
  from public.sessions s
  where s.id = sr.session_id
    and sr.added_by is null;

create index if not exists idx_session_restaurants_added_by
  on public.session_restaurants (added_by)
  where added_by is not null;

-- ─── REALTIME ────────────────────────────────────────────────
-- Les participants lisent déjà cette table sous RLS
-- (`session_restaurants_select_participant`) : la publication ne montre donc
-- que ce que chacun a déjà le droit de voir.
--
-- L'identité de réplication reste la clé primaire, à dessein : un DELETE ne
-- diffuse alors que l'id, donc n'atteint pas les abonnés (leur filtre porte
-- sur `session_id`). Passer en `replica identity full` les ferait arriver,
-- mais Supabase ne filtre pas les DELETE par RLS — ce serait diffuser le
-- contenu d'une session hors de ses participants. Un retrait revient donc par
-- la resynchronisation périodique, quelques secondes plus tard ; un ajout,
-- lui, est instantané.
alter publication supabase_realtime add table public.session_restaurants;

-- ─── RPC : AJOUT PAR UN PARTICIPANT ──────────────────────────
-- Idempotente : un resto déjà présent renvoie sa ligne au lieu d'échouer —
-- deux personnes peuvent proposer le même sans que l'une des deux voie une
-- erreur. Le verrou sur la session sérialise le calcul de `position`.
create or replace function public.add_session_restaurant(
  p_session_id uuid,
  p_restaurant_id uuid
)
  returns public.session_restaurants
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_row public.session_restaurants;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;

  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    perform public.raise_omk('session_not_found');
  end if;
  if not exists (
    select 1 from public.session_participants
    where session_id = p_session_id and profile_id = v_uid
  ) then
    perform public.raise_omk('not_participant');
  end if;
  if v_session.status = 'voting' then
    perform public.raise_omk('session_already_started');
  end if;
  if v_session.status = 'closed' then
    perform public.raise_omk('session_closed');
  end if;
  if not exists (select 1 from public.restaurants where id = p_restaurant_id) then
    perform public.raise_omk('invalid_restaurant');
  end if;

  select * into v_row
  from public.session_restaurants
  where session_id = p_session_id and restaurant_id = p_restaurant_id;
  if v_row.id is not null then
    return v_row;
  end if;

  if (select count(*) from public.session_restaurants where session_id = p_session_id) >= 100 then
    perform public.raise_omk('too_many_restaurants');
  end if;

  insert into public.session_restaurants (session_id, restaurant_id, position, added_by)
  select p_session_id, p_restaurant_id, coalesce(max(sr.position) + 1, 0), v_uid
  from public.session_restaurants sr
  where sr.session_id = p_session_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ─── RPC : RETRAIT ───────────────────────────────────────────
-- Chacun retire ce qu'il a apporté ; le host arbitre sur sa propre session.
-- Le dernier restaurant ne peut pas être retiré : une session vide ne se
-- lance pas, autant refuser tout de suite plutôt qu'au lancement.
create or replace function public.remove_session_restaurant(
  p_session_id uuid,
  p_restaurant_id uuid
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
  v_row public.session_restaurants;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;

  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    perform public.raise_omk('session_not_found');
  end if;
  if not exists (
    select 1 from public.session_participants
    where session_id = p_session_id and profile_id = v_uid
  ) then
    perform public.raise_omk('not_participant');
  end if;
  if v_session.status = 'voting' then
    perform public.raise_omk('session_already_started');
  end if;
  if v_session.status = 'closed' then
    perform public.raise_omk('session_closed');
  end if;

  select * into v_row
  from public.session_restaurants
  where session_id = p_session_id and restaurant_id = p_restaurant_id;
  if v_row.id is null then
    perform public.raise_omk('invalid_restaurant');
  end if;
  -- `is distinct from` des deux côtés : sur une session orpheline (host
  -- supprimé, `host_id` nul), un `<>` vaudrait NULL et laisserait passer.
  if v_row.added_by is distinct from v_uid and v_session.host_id is distinct from v_uid then
    perform public.raise_omk('not_your_restaurant');
  end if;
  if (select count(*) from public.session_restaurants where session_id = p_session_id) <= 1 then
    perform public.raise_omk('no_restaurants');
  end if;

  delete from public.session_restaurants where id = v_row.id;
end;
$$;

-- ─── RPC : CRÉATION DE SESSION ───────────────────────────────
-- Reprise à l'identique de `harden_rls_rpcs_and_voting`, au `added_by` près :
-- les restos posés à la création sont ceux du host, et doivent le dire.
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

  insert into public.session_restaurants (session_id, restaurant_id, position, added_by)
  select v_session.id, t.id, (t.ord - 1)::int, v_uid
  from unnest(v_ids) with ordinality as t(id, ord);

  insert into public.session_participants (session_id, profile_id)
  values (v_session.id, v_uid);

  return v_session;
end;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
revoke execute on function public.add_session_restaurant(uuid, uuid) from public, anon;
grant execute on function public.add_session_restaurant(uuid, uuid) to authenticated;

revoke execute on function public.remove_session_restaurant(uuid, uuid) from public, anon;
grant execute on function public.remove_session_restaurant(uuid, uuid) to authenticated;

-- ─── EXPORT RGPD ─────────────────────────────────────────────
-- `added_by` rattache une contribution à un compte : sans cette redéfinition,
-- les restos qu'une personne a apportés à une session seraient absents de son
-- export. Le corps est celui de `manual_restaurants`, à la clé
-- `restaurants_added` près, ajoutée dans chaque participation.
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
