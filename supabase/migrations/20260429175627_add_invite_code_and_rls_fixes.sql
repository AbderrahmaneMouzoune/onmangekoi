-- ─── ADD invite_code TO sessions ─────────────────────────────
-- Code court 6 caractères hex majuscules (16^6 ≈ 16M combinaisons) pour partage facile

alter table public.sessions
  add column invite_code text unique;

-- Génère un code pour les sessions existantes
update public.sessions
  set invite_code = upper(substring(encode(gen_random_bytes(3), 'hex'), 1, 6))
  where invite_code is null;

alter table public.sessions
  alter column invite_code set not null,
  alter column invite_code set default upper(substring(encode(gen_random_bytes(3), 'hex'), 1, 6));

-- ─── PROFILES: lecture par les utilisateurs authentifiés ──────
-- Nécessaire pour afficher les pseudos des autres participants en salle d'attente

create policy "profiles: authenticated read all"
  on public.profiles for select
  to authenticated
  using (true);

-- ─── SESSION_PARTICIPANTS: co-participants se voient entre eux ─
-- Nécessaire pour que la salle d'attente affiche tous les participants

create policy "session_participants: co-participants read"
  on public.session_participants for select
  using (
    exists (
      select 1 from public.session_participants sp2
      where sp2.session_id = session_participants.session_id
        and sp2.profile_id = auth.uid()
    )
  );

-- ─── REALTIME: publication Postgres Changes ───────────────────
-- Active les événements en temps réel pour la salle d'attente

alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.session_participants;
