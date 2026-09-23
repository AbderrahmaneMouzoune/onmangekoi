-- ============================================================
-- onmangekoi — deux restaurants minimum pour lancer
-- ============================================================
--   * Un vote sur un seul restaurant ne départage rien : le classement est
--     connu d'avance. Le lancement exige donc 2 restos, comme il exige déjà
--     2 participants.
--   * La règle porte sur le lancement, pas sur la création : depuis
--     `participant_restaurants`, une session en attente se complète — chacun
--     apporte le sien. Créer à un resto reste donc légitime ; c'est partir
--     voter à un resto qui ne l'est pas.
--   * `launch_session` est reprise telle que `timed_sessions` l'a laissée,
--     garde-fou d'échéance compris : la redéfinir sans repartir de la dernière
--     version reviendrait à annuler la sienne.
-- ============================================================

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
  -- Le job ne ferme que les sessions `voting` : lancer après l'échéance
  -- produirait une session que plus rien ne clôture. Le host prolonge d'abord.
  if v_session.closes_at is not null and v_session.closes_at <= now() then
    perform public.raise_omk('deadline_passed');
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
revoke execute on function public.launch_session(uuid) from public, anon;
grant execute on function public.launch_session(uuid) to authenticated;
