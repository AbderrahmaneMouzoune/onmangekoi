-- ============================================================
-- onmangekoi — codes Crockford base32 & liens de liste lisibles
-- ============================================================
--   * Les codes d'invitation (6) et les nouveaux codes de partage de liste
--     (10) utilisent l'alphabet Crockford base32 : 0-9 A-Z sans I, L, O, U.
--     À la saisie, I et L valent 1, O vaut 0, casse et séparateurs ignorés.
--   * Les listes gagnent un `share_code` court ; l'ancien `share_token`
--     (32 hex) reste accepté pour ne casser aucun lien déjà partagé.
--   * Les anciens codes d'invitation restent valides : la résolution essaie
--     la saisie brute puis sa forme normalisée.
-- ============================================================

-- ─── HELPERS ─────────────────────────────────────────────────

-- Tirage uniforme : 256 % 32 = 0, un octet → un symbole sans biais.
create or replace function public.crockford_code(p_length int)
  returns text
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea;
  v_code text := '';
  i int;
begin
  if p_length is null or p_length < 1 or p_length > 64 then
    raise exception 'omk:invalid_code_length' using errcode = 'P0001';
  end if;
  v_bytes := extensions.gen_random_bytes(p_length);
  for i in 0..p_length - 1 loop
    v_code := v_code || substr(alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- Forme canonique d'une saisie humaine : majuscules, séparateurs retirés, I/L → 1, O → 0.
create or replace function public.normalize_crockford(p_input text)
  returns text
  language sql
  immutable
  set search_path = ''
as $$
  select translate(upper(regexp_replace(coalesce(p_input, ''), '[\s\-_.]+', '', 'g')), 'ILO', '110');
$$;

-- ─── CODES D'INVITATION (sessions) ───────────────────────────
create or replace function public.generate_invite_code()
  returns text
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := public.crockford_code(6);
    exit when not exists (select 1 from public.sessions where invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- ─── CODES DE PARTAGE (listes) ───────────────────────────────
create or replace function public.generate_share_code()
  returns text
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := public.crockford_code(10);
    exit when not exists (select 1 from public.lists where share_code = v_code);
  end loop;
  return v_code;
end;
$$;

alter table public.lists add column if not exists share_code text;

do $$
declare
  r record;
begin
  for r in select id from public.lists where share_code is null loop
    update public.lists set share_code = public.generate_share_code() where id = r.id;
  end loop;
end;
$$;

alter table public.lists
  alter column share_code set not null,
  alter column share_code set default public.generate_share_code();

create unique index if not exists lists_share_code_key on public.lists (share_code);

-- Résolution d'une liste par code court (normalisé) ou ancien token long.
create or replace function public.find_list_by_share(p_identifier text)
  returns public.lists
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_raw text := btrim(coalesce(p_identifier, ''));
  v_code text := public.normalize_crockford(v_raw);
  v_list public.lists;
begin
  if lower(v_raw) ~ '^[a-f0-9]{32}$' then
    select * into v_list from public.lists where share_token = lower(v_raw);
    if v_list.id is not null then
      return v_list;
    end if;
  end if;
  if v_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$' then
    select * into v_list from public.lists where share_code = v_code;
  end if;
  return v_list;
end;
$$;

-- Le type de retour change (share_code ajouté) : suppression avant recréation.
drop function if exists public.list_by_share_token(text);
create function public.list_by_share_token(p_token text)
  returns table (
    id uuid,
    name text,
    is_collaborative boolean,
    owner_pseudo text,
    restaurant_count int,
    share_code text
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
    l.share_code
  from public.find_list_by_share(p_token) l
  join public.profiles p on p.id = l.owner_id
  where l.id is not null;
$$;

create or replace function public.list_restaurants_by_share_token(p_token text)
  returns setof public.restaurants
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select r.*
  from public.find_list_by_share(p_token) l
  join public.list_restaurants lr on lr.list_id = l.id
  join public.restaurants r on r.id = lr.restaurant_id
  where l.id is not null
  order by lr.added_at asc, r.name asc;
$$;

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

  v_list := public.find_list_by_share(p_token);
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

  v_source := public.find_list_by_share(p_token);
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

-- ─── JOIN / PREVIEW : saisie tolérante (I/L → 1, O → 0) ──────
create or replace function public.join_session(p_identifier text)
  returns public.sessions
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_raw text := upper(regexp_replace(btrim(coalesce(p_identifier, '')), '[\s\-_.]+', '', 'g'));
  v_code text := public.normalize_crockford(v_raw);
  v_session public.sessions;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and pseudo is not null) then
    perform public.raise_omk('profile_incomplete');
  end if;

  if lower(v_raw) ~ '^[a-f0-9]{32}$' then
    select * into v_session from public.sessions where invite_token = lower(v_raw);
  elsif v_raw ~ '^[A-Z0-9]{6}$' then
    -- Saisie brute d'abord (anciens codes), puis forme Crockford normalisée.
    select * into v_session from public.sessions where invite_code = v_raw;
    if v_session.id is null and v_code <> v_raw then
      select * into v_session from public.sessions where invite_code = v_code;
    end if;
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
  join public.profiles p on p.id = s.host_id
  where (
      lower(ident.raw) ~ '^[a-f0-9]{32}$'
      and s.invite_token = lower(ident.raw)
    )
    or (
      (select auth.uid()) is not null
      and ident.compact ~ '^[A-Z0-9]{6}$'
      and s.invite_code in (ident.compact, public.normalize_crockford(ident.compact))
    );
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
revoke execute on function public.crockford_code(int) from public, anon, authenticated;
-- Valeur par défaut de lists.share_code : évaluée avec le rôle qui insère
-- (authenticated via RLS), donc l'exécution doit lui être ouverte. La fonction
-- est security definer et ne renvoie qu'un code libre aléatoire.
revoke execute on function public.generate_share_code() from public, anon;
grant execute on function public.generate_share_code() to authenticated;
revoke execute on function public.find_list_by_share(text) from public, anon, authenticated;
revoke execute on function public.normalize_crockford(text) from public, anon;
grant execute on function public.normalize_crockford(text) to authenticated;

revoke execute on function public.list_by_share_token(text) from public;
grant execute on function public.list_by_share_token(text) to anon, authenticated;
