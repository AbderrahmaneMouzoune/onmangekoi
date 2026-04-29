-- ============================================================
-- onmangekoi — init_schema
-- ============================================================

-- ─── ENUM ────────────────────────────────────────────────────
create type public.session_status as enum ('waiting', 'voting', 'closed');

-- ─── PROFILES ────────────────────────────────────────────────
-- Étend auth.users — créé automatiquement via trigger à chaque sign-up (y compris anonyme)
create table public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  pseudo      text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: own row select"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: own row update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Trigger pour synchroniser updated_at
create or replace function public.handle_updated_at()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Trigger pour créer automatiquement un profil à chaque nouvel utilisateur
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.profiles (id, pseudo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'pseudo', 'Anonyme')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── RESTAURANTS ─────────────────────────────────────────────
create table public.restaurants (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  cuisine_type  text,
  address       text,
  city          text,
  description   text,
  image_url     text,
  created_at    timestamptz not null default now()
);

alter table public.restaurants enable row level security;

-- Lecture publique pour tous (y compris anon)
create policy "restaurants: public read"
  on public.restaurants for select
  using (true);

-- ─── LISTS ───────────────────────────────────────────────────
create table public.lists (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,
  owner_id         uuid        not null references public.profiles (id) on delete cascade,
  share_token      text        not null unique default encode(gen_random_bytes(16), 'hex'),
  is_collaborative boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.lists enable row level security;

create policy "lists: owner full access"
  on public.lists for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "lists: share_token read"
  on public.lists for select
  using (true); -- filtré par share_token côté application ; le token est opaque et non devinable

create trigger lists_updated_at
  before update on public.lists
  for each row execute function public.handle_updated_at();

-- ─── LIST_RESTAURANTS ────────────────────────────────────────
create table public.list_restaurants (
  list_id        uuid        not null references public.lists (id) on delete cascade,
  restaurant_id  uuid        not null references public.restaurants (id) on delete cascade,
  added_at       timestamptz not null default now(),
  primary key (list_id, restaurant_id)
);

alter table public.list_restaurants enable row level security;

create policy "list_restaurants: owner of list full access"
  on public.list_restaurants for all
  using (
    exists (
      select 1 from public.lists
      where id = list_id and owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.lists
      where id = list_id and owner_id = auth.uid()
    )
  );

create policy "list_restaurants: collaborative list insert"
  on public.list_restaurants for insert
  with check (
    exists (
      select 1 from public.lists
      where id = list_id and is_collaborative = true
    )
  );

create policy "list_restaurants: public read via list"
  on public.list_restaurants for select
  using (true);

-- ─── SESSIONS ────────────────────────────────────────────────
create table public.sessions (
  id            uuid                 primary key default gen_random_uuid(),
  name          text                 not null,
  host_id       uuid                 not null references public.profiles (id) on delete cascade,
  invite_token  text                 not null unique default encode(gen_random_bytes(16), 'hex'),
  status        public.session_status not null default 'waiting',
  created_at    timestamptz          not null default now(),
  launched_at   timestamptz,
  closed_at     timestamptz
);

alter table public.sessions enable row level security;

create policy "sessions: host full access"
  on public.sessions for all
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create policy "sessions: participants read"
  on public.sessions for select
  using (
    exists (
      select 1 from public.session_participants
      where session_id = id and profile_id = auth.uid()
    )
  );

create policy "sessions: invite_token join (insert participant)"
  on public.sessions for select
  using (true); -- lecture via invite_token autorisée pour tous (token opaque)

-- ─── SESSION_RESTAURANTS ─────────────────────────────────────
create table public.session_restaurants (
  id             uuid    primary key default gen_random_uuid(),
  session_id     uuid    not null references public.sessions (id) on delete cascade,
  restaurant_id  uuid    not null references public.restaurants (id),
  position       integer not null,
  unique (session_id, restaurant_id)
);

alter table public.session_restaurants enable row level security;

create policy "session_restaurants: host can manage"
  on public.session_restaurants for all
  using (
    exists (
      select 1 from public.sessions
      where id = session_id and host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions
      where id = session_id and host_id = auth.uid()
    )
  );

create policy "session_restaurants: participants read"
  on public.session_restaurants for select
  using (
    exists (
      select 1 from public.session_participants
      where session_id = session_restaurants.session_id and profile_id = auth.uid()
    )
  );

-- ─── SESSION_PARTICIPANTS ────────────────────────────────────
create table public.session_participants (
  id                    uuid        primary key default gen_random_uuid(),
  session_id            uuid        not null references public.sessions (id) on delete cascade,
  profile_id            uuid        not null references public.profiles (id) on delete cascade,
  joined_at             timestamptz not null default now(),
  has_finished_voting   boolean     not null default false,
  superlike_used        boolean     not null default false,
  super_dislike_used    boolean     not null default false,
  unique (session_id, profile_id)
);

alter table public.session_participants enable row level security;

create policy "session_participants: own row full access"
  on public.session_participants for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create policy "session_participants: host reads all in session"
  on public.session_participants for select
  using (
    exists (
      select 1 from public.sessions
      where id = session_id and host_id = auth.uid()
    )
  );

-- ─── VOTES ───────────────────────────────────────────────────
create table public.votes (
  id                      uuid       primary key default gen_random_uuid(),
  session_id              uuid       not null references public.sessions (id) on delete cascade,
  participant_id          uuid       not null references public.session_participants (id) on delete cascade,
  session_restaurant_id   uuid       not null references public.session_restaurants (id) on delete cascade,
  value                   smallint   not null check (value in (-2, 0, 1, 2)),
  created_at              timestamptz not null default now(),
  unique (participant_id, session_restaurant_id)
);

alter table public.votes enable row level security;

create policy "votes: own row full access"
  on public.votes for all
  using (
    exists (
      select 1 from public.session_participants
      where id = participant_id and profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.session_participants
      where id = participant_id and profile_id = auth.uid()
    )
  );

create policy "votes: readable by all after session closed"
  on public.votes for select
  using (
    exists (
      select 1 from public.sessions
      where id = session_id and closed_at is not null
    )
  );

-- ─── GRANTS (Data API) ───────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select on public.restaurants to anon, authenticated;
grant all on public.profiles to authenticated;
grant all on public.lists to authenticated;
grant all on public.list_restaurants to authenticated;
grant all on public.sessions to authenticated;
grant all on public.session_restaurants to authenticated;
grant all on public.session_participants to authenticated;
grant all on public.votes to authenticated;

-- ─── SEED — RESTAURANTS ──────────────────────────────────────
insert into public.restaurants (name, cuisine_type, city, description) values
  ('Sushi Bar Sakura',       'Japonais',      null, 'Sushis et sashimis préparés minute, ambiance épurée.'),
  ('Gyoza Bar',              'Japonais',      null, 'Spécialiste des gyozas maison, décor izakaya.'),
  ('La Trattoria Roma',      'Italien',       null, 'Pasta fraîche, pizzas au feu de bois, vins italiens.'),
  ('Pizza Napolitana',       'Italien',       null, 'Pizzas à la napolitaine, pâte fine et croustillante.'),
  ('Pasta e Vino',           'Italien',       null, 'Cave à vins et pâtes maison dans une ambiance cave à manger.'),
  ('Le Bistrot du Marché',   'Français',      null, 'Cuisine bistrot du terroir, ardoise du jour.'),
  ('Le Petit Brasseur',      'Brasserie',     null, 'Brasserie traditionnelle, steak-frites et moules-frites.'),
  ('Burger & Co',            'Américain',     null, 'Smash burgers artisanaux, frites maison.'),
  ('The Grill Room',         'Américain',     null, 'BBQ, ribs et chicken wings façon américaine.'),
  ('Taj Mahal',              'Indien',        null, 'Cuisine du nord de l''Inde, tandoori et currys parfumés.'),
  ('Curry House',            'Indien',        null, 'Currys du sud de l''Inde, dosas et thalis.'),
  ('Maison Pho',             'Vietnamien',    null, 'Bouillons pho maison mijotés 12h, rouleaux de printemps.'),
  ('El Rancho',              'Mexicain',      null, 'Tacos, quesadillas et guacamole maison.'),
  ('Street Tacos',           'Mexicain',      null, 'Tacos de rue authentiques, tortillas fraîches.'),
  ('Kebab Palace',           'Turc',          null, 'Döner kebab, lahmacun et mezze turcs.'),
  ('Dim Sum Express',        'Chinois',       null, 'Dim sum vapeur et sautés, service rapide.'),
  ('Poké House',             'Hawaïen',       null, 'Poké bowls personnalisables, ingrédients frais.'),
  ('Falafel Corner',         'Libanais',      null, 'Falafels croustillants, mezze et pita maison.'),
  ('Mediterranean Kitchen',  'Méditerranéen', null, 'Tapas méditerranéennes, huile d''olive et herbes fraîches.'),
  ('Wok Garden',             'Asiatique',     null, 'Wok sauté façon street food asiatique, ingrédients du marché.');
