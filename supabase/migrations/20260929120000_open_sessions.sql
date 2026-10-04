-- ============================================================
-- onmangekoi — session ouverte : chacun vote à son heure
-- ============================================================
-- Issue #58. Une session supposait tout le monde présent au même moment : le
-- host lance à partir de deux participants, et plus personne ne rejoint
-- ensuite. Un groupe se coordonne pourtant dans une conversation — le message
-- part à 10 h, chacun le voit quand il le voit. Le vote chronométré (#9) a
-- posé ce qui permet de se passer du rendez-vous : une échéance qui ferme
-- toute seule.
--
-- Principes :
--   * Le mode vit dans `sessions.rules`, sous une clé `open`, et non dans une
--     colonne dédiée. C'est une règle de session au même titre que les
--     jokers et le seuil : choisie à la création, figée ensuite, annoncée sur
--     l'écran d'invitation. Les règles ont déjà tout ce chemin — validation
--     (`rules_are_valid`), normalisation (`normalize_rules`), exposition
--     (`session_preview`, export RGPD), recopie au second tour — et le
--     paramètre `p_rules` de `create_session` suffit : ni nouvelle signature,
--     ni nouveau type généré. Surtout, `open` et `close_at_ratio` se
--     contraignent l'un l'autre ; les garder dans le même objet permet à une
--     seule fonction de vérifier leur cohérence.
--   * La clé est facultative et n'est écrite que lorsqu'elle vaut `true` :
--     une session ordinaire garde exactement les règles d'avant, sans rien à
--     reprendre dans les lignes existantes.
--   * Une session ouverte part directement en `voting` (`launched_at` posé à
--     la création) : ni salle d'attente, ni lancement. `join_session`
--     l'accepte pendant le vote, jusqu'à l'échéance ; une session ordinaire
--     continue de refuser avec `omk:session_started`.
--   * L'échéance est **obligatoire** : sans elle, une session ouverte ne se
--     fermerait jamais. Le refus tombe à la création
--     (`omk:open_session_needs_deadline`), et une contrainte `check` interdit
--     qu'une autre route produise une session ouverte sans échéance.
--   * La clôture automatique au seuil ne s'applique pas : le nombre de
--     votants n'est pas connu d'avance — le premier arrivé qui termine
--     « atteindrait 100 % » tout seul. Seules l'échéance et la main du host
--     ferment. `close_at_ratio` est donc ramené à 1 : des règles stockées ne
--     doivent pas raconter un seuil qui n'existe pas.
--   * Un arrivant tardif vote sur le même instantané de restaurants : rien ne
--     change au calcul, les votes manquants comptent déjà 0. Pour la même
--     raison, personne n'ajoute de restaurant en cours de route — il n'y a
--     pas d'attente pendant laquelle le faire, et un resto arrivé après les
--     premiers bulletins partirait avec des zéros qu'il n'a pas mérités.
--     `add_session_restaurant` refuse déjà toute session en `voting`.
--   * Le mode est figé **à la création**, pas au lancement : il décide s'il
--     y a une salle d'attente, il ne peut pas changer une fois qu'elle existe
--     — ou qu'elle n'existe pas.
--   * Le second tour d'une session ouverte n'est pas ouvert : ses votants
--     sont connus, ce sont ceux qui ont voté au premier tour. Il n'a pas
--     d'échéance à hériter et se clôt comme tout second tour, quand chacun a
--     fini. Un participant arrivé sans jamais voter n'y est pas convié : il
--     bloquerait la clôture d'un vote qui ne l'a pas attendu.
--   * Purge : rien à changer. Une session ouverte n'est jamais `waiting`, et
--     son échéance obligatoire la fait clore par `close_expired_sessions` ;
--     elle suit ensuite la rétention des sessions closes.
-- ============================================================

-- ─── LECTURE DU MODE ─────────────────────────────────────────
-- Tolérante par construction : une comparaison jsonb, jamais un cast. Elle
-- sert dans des contraintes `check`, dont l'ordre d'évaluation n'est pas
-- garanti — un `(rules ->> 'open')::boolean` lèverait sur une valeur mal
-- typée au lieu de laisser `rules_are_valid` la refuser proprement.
create or replace function public.session_is_open(p_rules jsonb)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select coalesce(p_rules -> 'open' = 'true'::jsonb, false);
$$;

-- ─── VALIDATION ──────────────────────────────────────────────
-- Reprise de `20260923110000_session_rules.sql`, avec une quatrième clé
-- facultative. Les trois autres restent obligatoires : les lignes écrites
-- avant cette migration sont valides telles quelles.
create or replace function public.rules_are_valid(p_rules jsonb)
  returns boolean
  language plpgsql
  immutable
  set search_path = ''
as $$
declare
  v_required constant text[] := array['superlikes', 'vetos', 'close_at_ratio'];
  v_allowed  constant text[] := array['superlikes', 'vetos', 'close_at_ratio', 'open'];
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

  v_superlikes := (p_rules ->> 'superlikes')::numeric;
  v_vetos := (p_rules ->> 'vetos')::numeric;
  v_ratio := (p_rules ->> 'close_at_ratio')::numeric;

  -- En mode ouvert, le seuil n'existe pas : seule la valeur neutre passe.
  if public.session_is_open(p_rules) and v_ratio <> 1 then
    return false;
  end if;

  -- 5 jokers par type : au-delà, le joker n'en est plus un. Une clôture sous
  -- la moitié des votants ferait trancher une minorité.
  return v_superlikes between 0 and 5 and v_superlikes = trunc(v_superlikes)
     and v_vetos between 0 and 5 and v_vetos = trunc(v_vetos)
     and v_ratio between 0.5 and 1;
end;
$$;

-- Complète les clés absentes, puis ramène le mode à sa forme unique :
-- `open: false` disparaît (c'est le défaut), `open: true` neutralise le
-- seuil. Le formulaire peut ainsi envoyer un seuil réglé avant qu'on coche
-- « ouverte » sans que la création échoue pour une règle devenue sans objet.
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

  if not public.rules_are_valid(v_rules) then
    perform public.raise_omk('invalid_rules');
  end if;

  return v_rules;
end;
$$;

comment on column public.sessions.rules is
  'Règles du vote : {"superlikes": n, "vetos": n, "close_at_ratio": r, "open": true?}. '
  'Jokers et seuil figés au lancement, mode ouvert figé à la création. Le défaut reproduit '
  'les règles historiques — 1 coup de cœur, 1 veto, clôture à 100 %, salle d''attente.';

-- ─── CONTRAINTES ─────────────────────────────────────────────
-- Les deux garanties qui font une session ouverte, portées par la table et
-- non par la seule RPC : pas d'ouverte sans échéance — elle ne fermerait
-- jamais —, et pas d'ouverte en salle d'attente — rien ne la lancerait.
alter table public.sessions
  add constraint sessions_open_needs_deadline
  check (not public.session_is_open(rules) or closes_at is not null);

alter table public.sessions
  add constraint sessions_open_skips_waiting
  check (not public.session_is_open(rules) or status <> 'waiting');

-- ─── GEL DU MODE ─────────────────────────────────────────────
-- Les jokers et le seuil restent modifiables en salle d'attente (aucune RPC
-- ne le fait aujourd'hui, mais la base ne l'interdit pas). Le mode, lui, est
-- figé dès la création : c'est lui qui décide s'il y a une salle d'attente.
create or replace function public.freeze_rules_after_launch()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if public.session_is_open(new.rules) is distinct from public.session_is_open(old.rules) then
    perform public.raise_omk('rules_locked');
  end if;
  if new.rules is distinct from old.rules and old.status <> 'waiting' then
    perform public.raise_omk('rules_locked');
  end if;
  return new;
end;
$$;

-- ─── CRÉATION ────────────────────────────────────────────────
-- Reprise de `20260923110000_session_rules.sql`, signature comprise. En mode
-- ouvert :
--   * l'échéance manquante est refusée ici, avant toute écriture ;
--   * deux restaurants au moins — la règle que `launch_session` pose au
--     lancement, qui n'aura pas lieu, et que personne ne pourra compléter ;
--   * la session naît en `voting`, `launched_at` posé : c'est le moment où
--     le vote commence vraiment, et l'historique le lit ainsi.
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
  if v_open and array_length(v_ids, 1) < 2 then
    perform public.raise_omk('not_enough_restaurants');
  end if;

  insert into public.sessions (name, host_id, invite_code, closes_at, rules, status, launched_at)
  values (
    v_name,
    v_uid,
    public.generate_invite_code(),
    p_closes_at,
    v_rules,
    case when v_open then 'voting' else 'waiting' end::public.session_status,
    case when v_open then now() end
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

-- ─── REJOINDRE PENDANT LE VOTE ───────────────────────────────
-- Reprise de `20260922140000_join_attempts_rate_limit.sql`. Une session
-- ouverte accepte les arrivées jusqu'à son échéance ; passé l'échéance, elle
-- est close pour qui arrive, même si le balayage à la minute ne l'a pas
-- encore écrit. Une session ordinaire refuse toujours avec `session_started`.
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

  if v_session.status = 'voting' and not v_open then
    perform public.raise_omk('session_started');
  end if;
  if v_session.status = 'closed' or (v_open and v_session.closes_at <= now()) then
    perform public.raise_omk('session_closed');
  end if;

  insert into public.session_participants (session_id, profile_id)
  values (v_session.id, v_uid)
  on conflict (session_id, profile_id) do nothing;

  return v_session;
end;
$$;

-- ─── CLÔTURE AU SEUIL : PAS EN MODE OUVERT ───────────────────
-- Reprise de `20260923110000_session_rules.sql`. En mode ouvert, « tout le
-- monde » n'est que ceux qui sont déjà passés : le premier qui termine
-- seul clôturerait la session au nez des suivants. L'échéance et le host
-- ferment ; ce trigger s'abstient.
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

-- ─── APERÇU D'INVITATION ─────────────────────────────────────
-- Reprise de `20260923110000_session_rules.sql`, type de retour inchangé. Le
-- visiteur anonyme — celui qui n'a pas encore de pseudo, et le robot qui
-- déplie le lien dans la conversation — voit aussi une session ouverte en
-- cours de vote : elle prend encore du monde, son aperçu doit exister.
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
      )
    );
$$;

-- ─── INVITER UN GROUPE PENDANT LE VOTE ───────────────────────
-- Reprise de `20260921120000_recurring_groups.sql`. Une invitation mène
-- quelque part tant qu'on peut encore entrer : en salle d'attente, ou dans
-- une session ouverte avant son échéance.
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
  if v_session.status = 'closed' then
    perform public.raise_omk('session_closed');
  end if;
  -- Session ordinaire lancée : plus personne ne rejoint, une invitation posée
  -- ici ne mènerait nulle part. Session ouverte : jusqu'à l'échéance.
  if v_session.status <> 'waiting' then
    if not public.session_is_open(v_session.rules) then
      perform public.raise_omk('session_already_started');
    end if;
    if v_session.closes_at <= now() then
      perform public.raise_omk('session_closed');
    end if;
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

-- ─── MES INVITATIONS EN ATTENTE ──────────────────────────────
-- Reprise de `20260921120000_recurring_groups.sql`, même type de retour. Une
-- invitation vers une session ouverte reste d'actualité jusqu'à l'échéance :
-- c'est même le cas d'usage, le groupe qu'on prévient le matin.
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
    and (
      s.status = 'waiting'
      or (s.status = 'voting' and public.session_is_open(s.rules) and s.closes_at > now())
    )
  order by si.invited_at desc;
$$;

-- ─── SECOND TOUR ─────────────────────────────────────────────
-- Reprise de `20260923120000_tiebreak_runoff_and_draw.sql`. Le second tour
-- d'une session ouverte n'est pas ouvert (voir l'en-tête) : ses règles
-- perdent la clé `open`, et seuls ceux qui ont voté au premier tour y sont
-- conviés — le host toujours, c'est lui qui le déclenche et qui doit le voir.
create or replace function public.create_runoff_session(p_session_id uuid)
  returns public.sessions
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_tied uuid[] := public.tiebreak_candidates(p_session_id);
  v_session public.sessions;
  v_open boolean;
  v_runoff public.sessions;
begin
  select * into v_session from public.sessions where id = p_session_id;
  v_open := public.session_is_open(v_session.rules);

  insert into public.sessions (name, host_id, invite_code, parent_session_id, status, launched_at, rules)
  values (
    v_session.name,
    v_session.host_id,
    public.generate_invite_code(),
    v_session.id,
    'voting',
    now(),
    v_session.rules - 'open'
  )
  returning * into v_runoff;

  -- Les ex æquo, dans l'ordre du premier tour. Chacun garde qui l'avait
  -- apporté (`added_by`, voir `participant_restaurants`).
  insert into public.session_restaurants (session_id, restaurant_id, position, added_by)
  select
    v_runoff.id,
    sr.restaurant_id,
    (row_number() over (order by sr.position) - 1)::int,
    sr.added_by
  from public.session_restaurants sr
  where sr.id = any (v_tied);

  -- Les mêmes participants. Un compte supprimé (`profile_id` à null) ne
  -- revote pas : sa ligne du premier tour reste où elle est.
  insert into public.session_participants (session_id, profile_id)
  select v_runoff.id, sp.profile_id
  from public.session_participants sp
  where sp.session_id = v_session.id
    and sp.profile_id is not null
    and (
      not v_open
      or sp.profile_id = v_session.host_id
      or exists (select 1 from public.votes v where v.participant_id = sp.id)
    );

  update public.sessions
    set tiebreak_method = 'runoff'
    where id = v_session.id;

  return v_runoff;
end;
$$;

-- ─── GRANTS ──────────────────────────────────────────────────
-- `create or replace` conserve les ACL ; on les réaffirme pour que la
-- migration décrive seule l'état attendu. `session_is_open` reste exécutable,
-- comme `rules_are_valid` : les contraintes `check` sont évaluées par le rôle
-- qui écrit. Elle ne lit aucune donnée.
revoke execute on function public.normalize_rules(jsonb) from public, anon, authenticated;
revoke execute on function public.freeze_rules_after_launch() from public, anon, authenticated;

revoke execute on function public.create_session(text, uuid[], timestamptz, jsonb) from public, anon;
grant execute on function public.create_session(text, uuid[], timestamptz, jsonb) to authenticated;

revoke execute on function public.join_session(text) from public, anon;
grant execute on function public.join_session(text) to authenticated;

revoke execute on function public.session_preview(text) from public;
grant execute on function public.session_preview(text) to anon, authenticated;

revoke execute on function public.invite_group_to_session(uuid, uuid) from public, anon;
grant execute on function public.invite_group_to_session(uuid, uuid) to authenticated;

revoke execute on function public.my_session_invitations() from public, anon;
grant execute on function public.my_session_invitations() to authenticated;

revoke execute on function public.create_runoff_session(uuid) from public, anon;
grant execute on function public.create_runoff_session(uuid) to authenticated;
