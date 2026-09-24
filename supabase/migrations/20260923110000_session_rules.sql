-- ============================================================
-- onmangekoi — règles de vote personnalisables par session
-- ============================================================
-- Les règles étaient écrites en dur dans `submit_vote` et dans le trigger de
-- clôture : un coup de cœur, un veto, et on n'affiche le classement que
-- lorsque 100 % des participants ont terminé. Ça convient à une tablée de
-- quatre ; à douze, il manque toujours quelqu'un, et un seul veto ne suffit
-- plus à écarter ce qui ne passe pas.
--
-- Principes :
--   * `sessions.rules` est un objet jsonb à trois clés — `superlikes`,
--     `vetos`, `close_at_ratio` — dont le défaut reproduit exactement les
--     règles d'avant. Une session qui ne dit rien vit comme avant.
--   * La base reste la seule source de vérité : `submit_vote` compte les
--     jokers déjà posés au lieu de lire un booléen, et le trigger de clôture
--     compare le nombre de votants arrivés au bout à un seuil calculé depuis
--     `close_at_ratio`. L'interface ne fait que refléter.
--   * Les bornes sont vérifiées deux fois : `normalize_rules` lève une erreur
--     métier lisible à la création, la contrainte `check` interdit qu'une
--     autre route écrive une règle hors bornes.
--   * Les règles sont figées au lancement : un trigger refuse toute écriture
--     de `rules` sur une session qui n'est plus en attente. Changer les
--     règles en cours de vote invaliderait les bulletins déjà déposés.
-- ============================================================

-- ─── VALEURS PAR DÉFAUT ──────────────────────────────────────
-- Une seule écriture du défaut, partagée par la colonne et la normalisation :
-- deux littéraux finiraient par diverger.
create or replace function public.default_session_rules()
  returns jsonb
  language sql
  immutable
  set search_path = ''
as $$
  select '{"superlikes": 1, "vetos": 1, "close_at_ratio": 1}'::jsonb;
$$;

-- ─── VALIDATION ──────────────────────────────────────────────
-- Une fonction plutôt qu'une expression `check` à rallonge : les casts n'y
-- sont exécutés qu'après le contrôle de type, ce qu'un `and` SQL — dont
-- l'ordre d'évaluation n'est pas garanti — ne promet pas.
create or replace function public.rules_are_valid(p_rules jsonb)
  returns boolean
  language plpgsql
  immutable
  set search_path = ''
as $$
declare
  v_keys constant text[] := array['superlikes', 'vetos', 'close_at_ratio'];
  v_superlikes numeric;
  v_vetos numeric;
  v_ratio numeric;
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then
    return false;
  end if;
  -- Ni clé manquante, ni clé en trop : une règle inconnue serait une règle
  -- silencieusement ignorée.
  if not (p_rules ?& v_keys) or p_rules - v_keys <> '{}'::jsonb then
    return false;
  end if;
  if jsonb_typeof(p_rules -> 'superlikes') <> 'number'
     or jsonb_typeof(p_rules -> 'vetos') <> 'number'
     or jsonb_typeof(p_rules -> 'close_at_ratio') <> 'number' then
    return false;
  end if;

  v_superlikes := (p_rules ->> 'superlikes')::numeric;
  v_vetos := (p_rules ->> 'vetos')::numeric;
  v_ratio := (p_rules ->> 'close_at_ratio')::numeric;

  -- 5 jokers par type : au-delà, le joker n'en est plus un. Une clôture sous
  -- la moitié des votants ferait trancher une minorité.
  return v_superlikes between 0 and 5 and v_superlikes = trunc(v_superlikes)
     and v_vetos between 0 and 5 and v_vetos = trunc(v_vetos)
     and v_ratio between 0.5 and 1;
end;
$$;

-- Complète les clés absentes par leur défaut, puis valide l'ensemble : le
-- client n'envoie que ce qu'il change, et une règle illisible est refusée
-- avec un code métier plutôt qu'une violation de contrainte brute.
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
  if not public.rules_are_valid(v_rules) then
    perform public.raise_omk('invalid_rules');
  end if;

  return v_rules;
end;
$$;

-- ─── COLONNE ─────────────────────────────────────────────────
alter table public.sessions
  add column if not exists rules jsonb not null default public.default_session_rules();

comment on column public.sessions.rules is
  'Règles du vote, figées au lancement : {"superlikes": n, "vetos": n, "close_at_ratio": r}. '
  'Le défaut reproduit les règles historiques — 1 coup de cœur, 1 veto, clôture à 100 %.';

alter table public.sessions drop constraint if exists sessions_rules_valid;
alter table public.sessions
  add constraint sessions_rules_valid check (public.rules_are_valid(rules));

-- ─── GEL APRÈS LE LANCEMENT ──────────────────────────────────
-- Passer de 2 vetos à 1 alors que deux vetos sont déjà posés rendrait des
-- bulletins invalides après coup. Aucune route applicative ne le permet — il
-- n'y a pas de `update` sur `sessions` hors RPC —, mais la garantie appartient
-- à la base : c'est elle qu'invoque le critère « règles figées au lancement ».
create or replace function public.freeze_rules_after_launch()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.rules is distinct from old.rules and old.status <> 'waiting' then
    perform public.raise_omk('rules_locked');
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_freeze_rules on public.sessions;
create trigger sessions_freeze_rules
  before update of rules on public.sessions
  for each row execute function public.freeze_rules_after_launch();

-- ─── CRÉATION AVEC RÈGLES ────────────────────────────────────
-- Quatrième paramètre : on remplace la fonction plutôt que de créer une
-- surcharge, que PostgREST ne saurait pas départager. Le corps est repris de
-- `20260920120000_participant_restaurants.sql` — `added_by` compris : les
-- restos posés à la création sont ceux du host.
drop function if exists public.create_session(text, uuid[], timestamptz);

create function public.create_session(
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

  insert into public.sessions (name, host_id, invite_code, closes_at, rules)
  values (
    v_name,
    v_uid,
    public.generate_invite_code(),
    p_closes_at,
    public.normalize_rules(p_rules)
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

-- ─── VOTE : LES JOKERS SE COMPTENT ───────────────────────────
-- Le quota ne tient plus dans un booléen. On compte les votes déjà posés à
-- cette valeur — la ligne participant est verrouillée juste au-dessus, deux
-- jokers concurrents restent donc sérialisés. Les colonnes `superlike_used` et
-- `super_dislike_used` survivent et disent maintenant « quota épuisé » : elles
-- sont lues par l'export RGPD et par les clients d'avant.
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
  v_rules jsonb;
  v_limit int;
  v_used int;
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

  if p_value in (2, -2) then
    v_rules := coalesce(v_session.rules, public.default_session_rules());
    v_limit := (v_rules ->> (case when p_value = 2 then 'superlikes' else 'vetos' end))::int;

    select count(*) into v_used
    from public.votes
    where participant_id = v_participant.id and value = p_value;

    -- Un quota à 0 refuse dès le premier essai : le joker est hors jeu.
    if v_used >= v_limit then
      perform public.raise_omk(
        case when p_value = 2 then 'superlike_used' else 'super_dislike_used' end
      );
    end if;

    if p_value = 2 then
      update public.session_participants
        set superlike_used = (v_used + 1 >= v_limit)
        where id = v_participant.id;
    else
      update public.session_participants
        set super_dislike_used = (v_used + 1 >= v_limit)
        where id = v_participant.id;
    end if;
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

-- ─── CLÔTURE AU SEUIL CHOISI ─────────────────────────────────
-- `close_at_ratio` à 1 redonne exactement la règle d'avant : le seuil vaut
-- alors le nombre de participants. En dessous, on arrondit au votant
-- supérieur — 80 % de 3 personnes, c'est 3, pas 2,4 — et jamais moins d'un
-- votant, sinon une session vide se clôturerait toute seule.
create or replace function public.handle_participant_finished()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_ratio numeric;
  v_total int;
  v_done int;
begin
  if new.has_finished_voting and not old.has_finished_voting then
    perform 1 from public.sessions where id = new.session_id for update;

    select coalesce((s.rules ->> 'close_at_ratio')::numeric, 1)
      into v_ratio
    from public.sessions s
    where s.id = new.session_id;

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
-- L'écran d'invitation annonce les règles avant qu'on entre : savoir qu'on
-- n'aura pas de veto, ou que le vote se clôt à 80 %, fait partie de ce à quoi
-- on dit oui. Le type de retour change : il faut supprimer puis recréer. Le
-- reste du corps est repris tel quel de
-- `20260905140000_gdpr_account_deletion_and_export.sql` — jointure externe sur
-- `profiles` pour une session dont le host a supprimé son compte, code
-- normalisé façon Crockford, et ouverture au visiteur anonyme limitée aux
-- sessions encore en attente.
drop function if exists public.session_preview(text);

create function public.session_preview(p_identifier text)
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
      and ((select auth.uid()) is not null or s.status = 'waiting')
    );
$$;

-- ─── EXPORT RGPD ─────────────────────────────────────────────
-- Toute colonne rattachée à `auth.uid()` doit se retrouver dans l'export :
-- les règles décrivent une session hébergée au même titre que son échéance.
-- Le corps est repris tel quel de `20260921120000_recurring_groups.sql` —
-- restos contribués, groupes et invitations compris — avec `rules` en plus.
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
-- `create_session` et `session_preview` ont été supprimées puis recréées :
-- leurs droits sont à reposer. `rules_are_valid` et `default_session_rules`
-- restent exécutables : la contrainte `check` et le défaut de colonne sont
-- évalués par le rôle qui écrit. Elles ne lisent aucune donnée.
revoke execute on function public.normalize_rules(jsonb) from public, anon, authenticated;
revoke execute on function public.freeze_rules_after_launch() from public, anon, authenticated;

revoke execute on function public.create_session(text, uuid[], timestamptz, jsonb) from public, anon;
grant execute on function public.create_session(text, uuid[], timestamptz, jsonb) to authenticated;

revoke execute on function public.session_preview(text) from public;
grant execute on function public.session_preview(text) to anon, authenticated;
