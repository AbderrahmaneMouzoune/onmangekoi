-- ============================================================
-- onmangekoi — amorcer le quartier : le quota d'un import de masse
-- ============================================================
-- Un nouveau groupe arrive devant un carnet vide. « Amorcer mon quartier »
-- le remplit d'un geste : une recherche Google autour de la position
-- autorisée, et les vingt restos les plus proches entrent en base par
-- `upsert_restaurant_from_place`, déjà idempotente sur `place_id`.
--
-- Une recherche Google se facture. Le geste est donc borné en base, pas
-- seulement dans l'interface :
--   * `neighbourhood_imports` est un journal de quota, rien de plus : qui a
--     amorcé, et quand. Aucune policy RLS ne l'ouvre —
--     `claim_neighbourhood_import()` en `security definer` est le seul
--     chemin, comme `upsert_restaurant_from_place` l'est pour l'import.
--   * Le créneau se prend AVANT l'appel à Google, et le verrou sur le profil
--     de l'appelant sérialise les demandes : une rafale de requêtes lancées
--     ensemble se compte une par une, au lieu de passer toute la
--     vérification avant la première écriture.
--   * La fenêtre (24 h) et le quota (3 amorçages) sont des fonctions, comme
--     `recent_winners_window()` : la base fait foi et le scénario SQL fige
--     les valeurs. L'application ne les redit pas — la RPC lui renvoie ce
--     qu'il reste d'amorçages, c'est tout ce qu'elle a à écrire.
--   * Chaque appel purge d'abord les lignes périmées de son auteur : le
--     journal reste de la taille de ce qu'il mesure, sans tâche planifiée.
--   * Ce journal n'entre pas dans l'export RGPD : il ne dit rien de plus que
--     « cette personne a amorcé son quartier à telle heure », il s'efface de
--     lui-même en 24 h, et la suppression du compte l'emporte en cascade.
-- ============================================================

-- ─── FENÊTRE ET QUOTA ────────────────────────────────────────
create or replace function public.neighbourhood_import_window()
  returns interval
  language sql
  immutable
  set search_path = ''
as $$
  select interval '24 hours';
$$;

comment on function public.neighbourhood_import_window() is
  'Fenêtre glissante sur laquelle se compte le quota d''amorçage du quartier.';

create or replace function public.neighbourhood_import_quota()
  returns integer
  language sql
  immutable
  set search_path = ''
as $$
  select 3;
$$;

comment on function public.neighbourhood_import_quota() is
  'Nombre d''amorçages du quartier accordés à une personne par fenêtre. '
  'La base fait foi : l''application lit ce qu''il en reste, elle ne le calcule pas.';

-- ─── JOURNAL DE QUOTA ────────────────────────────────────────
create table if not exists public.neighbourhood_imports (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.neighbourhood_imports enable row level security;

-- Aucune policy : la table ne se lit et ne s'écrit que par la RPC ci-dessous.
revoke all on public.neighbourhood_imports from public, anon, authenticated;

create index if not exists idx_neighbourhood_imports_user_claimed_at
  on public.neighbourhood_imports (user_id, claimed_at desc);

-- ─── RPC : PRENDRE UN CRÉNEAU ────────────────────────────────
-- Renvoie ce qu'il reste d'amorçages après celui-ci — de quoi le dire à la
-- personne avant qu'elle ne bute sur le refus.
create or replace function public.claim_neighbourhood_import()
  returns integer
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_quota integer := public.neighbourhood_import_quota();
  v_used integer;
begin
  if v_uid is null then
    perform public.raise_omk('not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and pseudo is not null) then
    perform public.raise_omk('profile_incomplete');
  end if;

  -- Verrou sur le profil de l'appelant : deux amorçages lancés en parallèle
  -- se comptent l'un après l'autre. Sans lui, une rafale de requêtes
  -- passerait toute la vérification avant la première insertion — c'est
  -- exactement la dépense contre laquelle ce quota existe.
  perform 1 from public.profiles where id = v_uid for update;

  -- Les lignes sorties de la fenêtre ne comptent plus pour personne.
  delete from public.neighbourhood_imports
  where user_id = v_uid
    and claimed_at < now() - public.neighbourhood_import_window();

  select count(*) into v_used
  from public.neighbourhood_imports
  where user_id = v_uid;

  if v_used >= v_quota then
    perform public.raise_omk('neighbourhood_quota_reached');
  end if;

  insert into public.neighbourhood_imports (user_id) values (v_uid);

  return v_quota - v_used - 1;
end;
$$;

comment on function public.claim_neighbourhood_import() is
  'Prend un créneau d''amorçage du quartier pour l''appelant, ou lève '
  'omk:neighbourhood_quota_reached. Renvoie les amorçages restants.';

-- ─── GRANTS ──────────────────────────────────────────────────
revoke execute on function public.neighbourhood_import_window() from public, anon;
revoke execute on function public.neighbourhood_import_quota() from public, anon;
revoke execute on function public.claim_neighbourhood_import() from public, anon;
grant execute on function public.neighbourhood_import_window() to authenticated;
grant execute on function public.neighbourhood_import_quota() to authenticated;
grant execute on function public.claim_neighbourhood_import() to authenticated;
