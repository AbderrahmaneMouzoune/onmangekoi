-- ============================================================
-- onmangekoi — mode duo : décider à deux, sans salle d'attente ni code
-- ============================================================
-- Issue #61. À deux, tout le protocole de session — créer, inviter,
-- attendre, lancer, classer — coûte plus cher que la décision qu'il sert. Le
-- mode duo garde le deck, les votes et l'instantané de restaurants ; il
-- retire la salle d'attente et remplace le classement par un accord.
--
-- Principes :
--   * Aucune table nouvelle. Le mode vit dans `sessions.rules`, sous une clé
--     `duo`, exactement comme `open` (#58) : validé par `rules_are_valid`,
--     ramené à sa forme unique par `normalize_rules`, lu par un helper
--     tolérant (`session_is_duo`), figé dès la création. La clé n'est écrite
--     que lorsqu'elle vaut `true`.
--   * Duo et session ouverte s'excluent : l'une accueille qui veut jusqu'à
--     l'échéance, l'autre a deux places. Les deux à la fois sont refusés
--     (`omk:invalid_rules`). L'échéance, elle, reste facultative en duo : le
--     vote se ferme au premier accord, ou quand les deux ont fini leur deck.
--   * Pas de salle d'attente : la session naît en `voting`, `launched_at`
--     posé, comme une session ouverte. Le premier vote dès la création ; le
--     second arrive directement sur le deck par le lien. Deux restaurants au
--     moins — personne ne pourra en ajouter ensuite.
--   * Deux places, vérifiées par la table : un trigger refuse une troisième
--     ligne dans `session_participants` (`omk:duo_full`), quelle que soit la
--     route qui l'écrit. `join_session` le dit avant d'essayer. Les arrivées
--     simultanées se sérialisent sur la ligne de session.
--   * Règle de clôture : dès qu'un restaurant reçoit « ça me va » ou mieux
--     (valeur 1 ou 2) des deux côtés, la session passe `closed` et la
--     décision (#55) est posée dans le même UPDATE — `decided_restaurant_id`
--     et `decided_at`. Le déclencheur vit sur `votes`, pas dans
--     `submit_vote` : la RPC reste celle de tout le monde, le mode ajoute
--     seulement ce qui se passe après un bulletin. Il verrouille la ligne de
--     session avant de regarder le bulletin de l'autre : deux « ça me va »
--     posés au même instant se sérialisent, et le second voit le premier —
--     un accord ne peut pas passer entre les deux. « Bof » (0) et veto (−2)
--     ne font jamais accord.
--   * Sans accord, la clôture habituelle : quand les deux ont fini leur
--     deck, le classement s'affiche — le mode ne crée pas d'impasse. Mais
--     « tout le monde a fini » exige ici les deux places occupées : le
--     premier qui termine seul, avant que l'autre ait ouvert le lien, ne
--     ferme rien. L'échéance, si on en a posé une, et le host ferment aussi.
--   * Les jokers restent, le seuil vaut 1 (`close_at_ratio` ramené à 1 comme
--     pour une session ouverte : un seuil sous 100 % à deux votants
--     fermerait sur le premier qui termine).
--   * Diffusion : la clôture et la décision sont un seul UPDATE de
--     `sessions`, déjà publié sur Realtime ; les deux écrans basculent sur le
--     résultat par l'événement qui sert déjà la clôture. La notification push
--     (#7) part par le trigger existant sur `sessions.status` : l'auteur du
--     bulletin décisif n'est pas prévenu, l'autre l'est.
--   * Le second tour d'un duo sans accord reste un duo : mêmes deux
--     participants, et le premier accord y ferme aussi le vote.
--     `create_runoff_session` ne retire que `open`, rien à reprendre.
--   * Purge : un duo sans échéance que personne ne ferme reste en `voting`,
--     comme une session ordinaire lancée et jamais close — rien ne change.
-- ============================================================

-- ─── LECTURE DU MODE ─────────────────────────────────────────
-- Même construction que `session_is_open` : une comparaison jsonb, jamais un
-- cast, pour rester sûre dans une contrainte `check`.
create or replace function public.session_is_duo(p_rules jsonb)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select coalesce(p_rules -> 'duo' = 'true'::jsonb, false);
$$;

-- ─── VALIDATION ──────────────────────────────────────────────
-- Reprise de `20260929120000_open_sessions.sql`, avec une cinquième clé
-- facultative.
create or replace function public.rules_are_valid(p_rules jsonb)
  returns boolean
  language plpgsql
  immutable
  set search_path = ''
as $$
declare
  v_required constant text[] := array['superlikes', 'vetos', 'close_at_ratio'];
  v_allowed  constant text[] := array['superlikes', 'vetos', 'close_at_ratio', 'open', 'duo'];
  v_superlikes numeric;
  v_vetos numeric;
  v_ratio numeric;
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then
    return false;
  end if;
  -- Ni clé manquante, ni clé en trop : une règle inconnue serait une règle
  -- silencieusement ignorée.
  if not (p_rules ?& v_required) or p_rules - v_allowed <> '{}'::jsonb then
    return false;
  end if;
  if jsonb_typeof(p_rules -> 'superlikes') <> 'number'
     or jsonb_typeof(p_rules -> 'vetos') <> 'number'
     or jsonb_typeof(p_rules -> 'close_at_ratio') <> 'number' then
    return false;
  end if;
  if p_rules ? 'open' and jsonb_typeof(p_rules -> 'open') <> 'boolean' then
    return false;
  end if;
  if p_rules ? 'duo' and jsonb_typeof(p_rules -> 'duo') <> 'boolean' then
    return false;
  end if;

  -- Deux places d'un côté, la porte ouverte jusqu'à l'échéance de l'autre :
  -- les deux modes ne se combinent pas.
  if public.session_is_open(p_rules) and public.session_is_duo(p_rules) then
    return false;
  end if;

  v_superlikes := (p_rules ->> 'superlikes')::numeric;
  v_vetos := (p_rules ->> 'vetos')::numeric;
  v_ratio := (p_rules ->> 'close_at_ratio')::numeric;

  -- En mode ouvert comme en duo, le seuil n'existe pas : seule la valeur
  -- neutre passe.
  if (public.session_is_open(p_rules) or public.session_is_duo(p_rules)) and v_ratio <> 1 then
    return false;
  end if;

  -- 5 jokers par type : au-delà, le joker n'en est plus un. Une clôture sous
  -- la moitié des votants ferait trancher une minorité.
  return v_superlikes between 0 and 5 and v_superlikes = trunc(v_superlikes)
     and v_vetos between 0 and 5 and v_vetos = trunc(v_vetos)
     and v_ratio between 0.5 and 1;
end;
$$;

-- Reprise de `20260929120000_open_sessions.sql` : `duo: false` disparaît,
-- `duo: true` neutralise le seuil. Une combinaison `open` + `duo` n'est pas
-- arbitrée ici — elle tombe sur `rules_are_valid`, et donc sur
-- `invalid_rules` : aucun des deux modes n'est plus « vrai » que l'autre.
create or replace function public.normalize_rules(p_rules jsonb)
  returns jsonb
  language plpgsql
  volatile
  set search_path = ''
as $$
declare
  v_rules jsonb;
begin
  if p_rules is null or jsonb_typeof(p_rules) = 'null' then
    return public.default_session_rules();
  end if;
  if jsonb_typeof(p_rules) <> 'object' then
    perform public.raise_omk('invalid_rules');
  end if;

  v_rules := public.default_session_rules() || p_rules;
  if v_rules -> 'open' = 'false'::jsonb then
    v_rules := v_rules - 'open';
  elsif v_rules -> 'open' = 'true'::jsonb then
    v_rules := v_rules || '{"close_at_ratio": 1}'::jsonb;
  end if;
  if v_rules -> 'duo' = 'false'::jsonb then
    v_rules := v_rules - 'duo';
  elsif v_rules -> 'duo' = 'true'::jsonb then
    v_rules := v_rules || '{"close_at_ratio": 1}'::jsonb;
  end if;

  if not public.rules_are_valid(v_rules) then
    perform public.raise_omk('invalid_rules');
  end if;

  return v_rules;
end;
$$;

comment on column public.sessions.rules is
  'Règles du vote : {"superlikes": n, "vetos": n, "close_at_ratio": r, "open": true?, "duo": true?}. '
  'Jokers et seuil figés au lancement, modes ouvert et duo figés à la création. Le défaut '
  'reproduit les règles historiques — 1 coup de cœur, 1 veto, clôture à 100 %, salle d''attente.';

-- ─── CONTRAINTE ──────────────────────────────────────────────
-- Un duo n'a pas de salle d'attente : rien ne le lancerait.
alter table public.sessions
  add constraint sessions_duo_skips_waiting
  check (not public.session_is_duo(rules) or status <> 'waiting');

-- ─── GEL DU MODE ─────────────────────────────────────────────
-- Reprise de `20260929120000_open_sessions.sql` : le mode duo décide lui
-- aussi s'il y a une salle d'attente, et combien de places — il ne change
-- pas une fois la session créée.
create or replace function public.freeze_rules_after_launch()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if public.session_is_open(new.rules) is distinct from public.session_is_open(old.rules)
     or public.session_is_duo(new.rules) is distinct from public.session_is_duo(old.rules) then
    perform public.raise_omk('rules_locked');
  end if;
  if new.rules is distinct from old.rules and old.status <> 'waiting' then
    perform public.raise_omk('rules_locked');
  end if;
  return new;
end;
$$;

-- ─── CRÉATION ────────────────────────────────────────────────
-- Reprise de `20260929120000_open_sessions.sql`, signature comprise. Un duo
-- part en `voting` comme une session ouverte, mais sans échéance
-- obligatoire : le premier accord, ou la fin des deux decks, le ferme.
create or replace function public.create_session(
  p_name text,
  p_restaurant_ids uuid[],
  p_closes_at timestamptz default null,
  p_rules jsonb default null
)
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
  v_rules jsonb;
  v_open boolean;
  v_duo boolean;
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

  v_rules := public.normalize_rules(p_rules);
  v_open := public.session_is_open(v_rules);
  v_duo := public.session_is_duo(v_rules);
  if v_open and p_closes_at is null then
    perform public.raise_omk('open_session_needs_deadline');
  end if;
  perform public.assert_valid_deadline(p_closes_at);

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
  if (v_open or v_duo) and array_length(v_ids, 1) < 2 then
    perform public.raise_omk('not_enough_restaurants');
  end if;

  insert into public.sessions (name, host_id, invite_code, closes_at, rules, status, launched_at)
  values (
    v_name,
    v_uid,
    public.generate_invite_code(),
    p_closes_at,
    v_rules,
    case when v_open or v_duo then 'voting' else 'waiting' end::public.session_status,
    case when v_open or v_duo then now() end
  )
  returning * into v_session;

  insert into public.session_restaurants (session_id, restaurant_id, position, added_by)
  select v_session.id, t.id, (t.ord - 1)::int, v_uid
  from unnest(v_ids) with ordinality as t(id, ord);

  insert into public.session_participants (session_id, profile_id)
  values (v_session.id, v_uid);

  return v_session;
end;
$$;

-- ─── DEUX PLACES ─────────────────────────────────────────────
-- La garantie tient dans la table, pas dans la seule RPC : toute écriture
-- dans `session_participants` — `join_session`, le second tour, une route à
-- venir — passe par ici. La ligne de session est verrouillée avant le
-- compte : deux arrivées simultanées sur la dernière place se sérialisent,
-- et la seconde voit la première.
create or replace function public.enforce_duo_capacity()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_rules jsonb;
begin
  -- Lecture sans verrou d'abord : les règles sont figées, et une session
  -- ordinaire n'a pas à sérialiser ses arrivées.
  select s.rules into v_rules from public.sessions s where s.id = new.session_id;
  if not public.session_is_duo(v_rules) then
    return new;
  end if;

  perform 1 from public.sessions s where s.id = new.session_id for update;

  if (select count(*) from public.session_participants sp
      where sp.session_id = new.session_id) >= 2 then
    perform public.raise_omk('duo_full');
  end if;
  return new;
end;
$$;

create trigger session_participants_duo_capacity
  before insert on public.session_participants
  for each row
  execute function public.enforce_duo_capacity();

-- ─── REJOINDRE UN DUO ────────────────────────────────────────
-- Reprise de `20260929120000_open_sessions.sql`. Un duo accepte son second
-- participant pendant le vote — il n'y a jamais eu d'attente —, jusqu'à son
-- échéance s'il en a une. Le refus d'une troisième personne est dit ici,
-- avant l'écriture ; le trigger ci-dessus le garantit quoi qu'il arrive.
create or replace function public.join_session(p_identifier text)
  returns public.sessions
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  -- 10 essais ratés en 10 minutes : une faute de frappe ou deux passent
  -- inaperçues, un balayage s'arrête au bout de 10 codes.
  c_window constant interval := interval '10 minutes';
  c_limit  constant integer  := 10;
  v_uid uuid := (select auth.uid());
  v_raw text := upper(regexp_replace(btrim(coalesce(p_identifier, '')), '[\s\-_.]+', '', 'g'));
  v_code text := public.normalize_crockford(v_raw);
  v_session public.sessions;
  v_failures integer;
  v_open boolean;
  v_duo boolean;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and pseudo is not null) then
    perform public.raise_omk('profile_incomplete');
  end if;

  select count(*) into v_failures
  from public.join_attempts
  where user_id = v_uid
    and attempted_at > now() - c_window;

  if v_failures >= c_limit then
    perform public.raise_omk('too_many_attempts');
  end if;

  if lower(v_raw) ~ '^[a-f0-9]{32}$' then
    select * into v_session from public.sessions where invite_token = lower(v_raw);
  elsif v_raw ~ '^[A-Z0-9]{6}$' then
    -- Saisie brute d'abord (anciens codes), puis forme Crockford normalisée.
    select * into v_session from public.sessions where invite_code = v_raw;
    if v_session.id is null and v_code <> v_raw then
      select * into v_session from public.sessions where invite_code = v_code;
    end if;
  end if;

  -- Format invalide ou code inconnu : dans les deux cas l'appelant a essayé
  -- quelque chose qui n'existe pas. On le compte, et on renvoie NULL plutôt
  -- que de lever — voir l'en-tête de `join_attempts_rate_limit`.
  if v_session.id is null then
    insert into public.join_attempts (user_id) values (v_uid);
    return null;
  end if;

  -- Un code juste efface l'ardoise : les essais ratés d'avant ne pèsent plus
  -- sur les suivants.
  delete from public.join_attempts where user_id = v_uid;

  if exists (
    select 1 from public.session_participants
    where session_id = v_session.id and profile_id = v_uid
  ) then
    return v_session;
  end if;

  v_open := public.session_is_open(v_session.rules);
  v_duo := public.session_is_duo(v_session.rules);

  if v_session.status = 'voting' and not (v_open or v_duo) then
    perform public.raise_omk('session_started');
  end if;
  if v_session.status = 'closed'
     or ((v_open or v_duo) and v_session.closes_at is not null and v_session.closes_at <= now()) then
    perform public.raise_omk('session_closed');
  end if;
  if v_duo and (
    select count(*) from public.session_participants where session_id = v_session.id
  ) >= 2 then
    perform public.raise_omk('duo_full');
  end if;

  insert into public.session_participants (session_id, profile_id)
  values (v_session.id, v_uid)
  on conflict (session_id, profile_id) do nothing;

  return v_session;
end;
$$;

-- ─── FIN DES DECKS : LES DEUX PLACES COMPTENT ────────────────
-- Reprise de `20260929120000_open_sessions.sql`. En duo, « tout le monde a
-- fini » veut dire les deux : celui qui termine avant que l'autre ait ouvert
-- le lien ne ferme rien, sinon le duo se résumerait à un vote solitaire.
create or replace function public.handle_participant_finished()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_rules jsonb;
  v_ratio numeric;
  v_total int;
  v_done int;
begin
  if new.has_finished_voting and not old.has_finished_voting then
    select s.rules into v_rules
    from public.sessions s
    where s.id = new.session_id
    for update;

    if public.session_is_open(v_rules) then
      return new;
    end if;

    v_ratio := coalesce((v_rules ->> 'close_at_ratio')::numeric, 1);

    select count(*), count(*) filter (where has_finished_voting)
      into v_total, v_done
    from public.session_participants
    where session_id = new.session_id;

    if public.session_is_duo(v_rules) and v_total < 2 then
      return new;
    end if;

    if v_done >= greatest(1, ceil(v_total * v_ratio)::int) then
      update public.sessions
        set status = 'closed', closed_at = now()
        where id = new.session_id
          and status = 'voting';
    end if;
  end if;
  return new;
end;
$$;

-- ─── PREMIER ACCORD ──────────────────────────────────────────
-- Après chaque « ça me va » ou coup de cœur posé dans un duo : si l'autre a
-- dit au moins « ça me va » au même restaurant, c'est d'accord. La clôture et
-- la décision partent dans un seul UPDATE — un seul événement Realtime, une
-- seule notification.
create or replace function public.handle_duo_agreement()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_rules jsonb;
  v_restaurant uuid;
begin
  -- Les règles sont figées : les lire sans verrou suffit à écarter, sans
  -- coût, les votes des sessions ordinaires.
  select s.rules into v_rules from public.sessions s where s.id = new.session_id;
  if not public.session_is_duo(v_rules) then
    return null;
  end if;

  -- Le verrou sérialise deux bulletins simultanés : celui qui l'obtient en
  -- second relit l'état validé par le premier, et voit son « ça me va ».
  perform 1 from public.sessions s
  where s.id = new.session_id and s.status = 'voting'
  for update;
  if not found then
    return null;
  end if;

  if not exists (
    select 1
    from public.votes v
    where v.session_restaurant_id = new.session_restaurant_id
      and v.participant_id <> new.participant_id
      and v.value >= 1
  ) then
    return null;
  end if;

  select sr.restaurant_id into v_restaurant
  from public.session_restaurants sr
  where sr.id = new.session_restaurant_id;

  update public.sessions
     set status = 'closed',
         closed_at = now(),
         decided_restaurant_id = v_restaurant,
         decided_at = now()
   where id = new.session_id
     and status = 'voting';

  return null;
end;
$$;

create trigger votes_duo_agreement
  after insert on public.votes
  for each row
  when (new.value >= 1)
  execute function public.handle_duo_agreement();

-- ─── APERÇU D'INVITATION ─────────────────────────────────────
-- Reprise de `20260929120000_open_sessions.sql`, type de retour inchangé. Le
-- lien d'un duo s'envoie dans une conversation : l'aperçu anonyme doit
-- exister tant qu'une place est libre et que le vote tourne.
create or replace function public.session_preview(p_identifier text)
  returns table (
    id uuid,
    name text,
    status public.session_status,
    host_pseudo text,
    participant_count int,
    restaurant_count int,
    rules jsonb
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
    (select count(*)::int from public.session_restaurants sr where sr.session_id = s.id),
    s.rules
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
      and (
        (select auth.uid()) is not null
        or s.status = 'waiting'
        or (
          s.status = 'voting'
          and public.session_is_open(s.rules)
          and s.closes_at > now()
        )
        or (
          s.status = 'voting'
          and public.session_is_duo(s.rules)
          and (s.closes_at is null or s.closes_at > now())
          and (select count(*) from public.session_participants sp where sp.session_id = s.id) < 2
        )
      )
    );
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
-- `session_is_duo` reste exécutable, comme `session_is_open` : les
-- contraintes `check` sont évaluées par le rôle qui écrit. Les fonctions de
-- trigger ne s'appellent pas directement.
revoke execute on function public.normalize_rules(jsonb) from public, anon, authenticated;
revoke execute on function public.freeze_rules_after_launch() from public, anon, authenticated;
revoke execute on function public.enforce_duo_capacity() from public, anon, authenticated;
revoke execute on function public.handle_duo_agreement() from public, anon, authenticated;
revoke execute on function public.handle_participant_finished() from public, anon, authenticated;

revoke execute on function public.create_session(text, uuid[], timestamptz, jsonb) from public, anon;
grant execute on function public.create_session(text, uuid[], timestamptz, jsonb) to authenticated;

revoke execute on function public.join_session(text) from public, anon;
grant execute on function public.join_session(text) to authenticated;

revoke execute on function public.session_preview(text) from public;
grant execute on function public.session_preview(text) to anon, authenticated;
