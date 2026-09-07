-- ============================================================
-- onmangekoi — deux restaurants minimum par session
-- ============================================================
--   * Un vote sur un seul restaurant ne départage rien : le classement est
--     connu d'avance. Le minimum passe donc de 1 à 2, au même titre que les
--     2 participants déjà exigés au lancement.
--   * La règle est posée aux deux bouts : `create_session` refuse d'ouvrir une
--     session qui ne pourrait jamais être lancée (on n'ajoute pas de resto à
--     une session en attente), `launch_session` refuse de lancer.
--   * Les sessions à un seul resto déjà en attente restent inertes : leur host
--     les supprime et en recrée une. Aucune n'est modifiée ici.
-- ============================================================

-- ─── CRÉATION ────────────────────────────────────────────────
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

  -- Le dédoublonnage précède le compte : deux fois le même resto n'en fait
  -- toujours qu'un, et ne suffit donc pas à ouvrir la session.
  if v_ids is null or array_length(v_ids, 1) < 2 then
    perform public.raise_omk('not_enough_restaurants');
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

-- ─── LANCEMENT ───────────────────────────────────────────────
-- Lance le vote. Réservé au host, exige au moins 2 participants et 2 restos.
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
  if (select count(*) from public.session_restaurants where session_id = p_session_id) < 2 then
    perform public.raise_omk('not_enough_restaurants');
  end if;

  update public.sessions
    set status = 'voting', launched_at = now()
    where id = p_session_id
    returning * into v_session;

  return v_session;
end;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
-- `create or replace` conserve les ACL ; on les réaffirme pour que la
-- migration décrive seule l'état attendu.
revoke execute on function public.create_session(text, uuid[]) from public, anon;
revoke execute on function public.launch_session(uuid) from public, anon;
grant execute on function public.create_session(text, uuid[]) to authenticated;
grant execute on function public.launch_session(uuid) to authenticated;
