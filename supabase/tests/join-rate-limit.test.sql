-- ============================================================
-- onmangekoi — scénario : limitation de débit sur « Rejoindre »
-- ============================================================
-- Vérifie les critères d'acceptation de l'issue #12 :
--   * un essai qui ne tombe sur aucune session est compté, sans exception —
--     lever annulerait la transaction, donc l'écriture du compteur ;
--   * deux fautes de frappe ne bloquent jamais un utilisateur légitime ;
--   * au 11ᵉ essai raté en 10 minutes, `omk:too_many_attempts` ;
--   * un code juste efface l'ardoise, et le compteur d'un utilisateur ne
--     pèse jamais sur un autre ;
--   * la fenêtre glisse : des essais vieux de plus de 10 minutes ne comptent
--     plus ;
--   * `purge_join_attempts` nettoie sans jamais entamer la fenêtre courante.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/join-rate-limit.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base, et la moindre assertion fausse interrompt tout.
-- ============================================================

\set ON_ERROR_STOP on

\set host    '44444444-4444-4444-8444-444444444444'
\set sam     '55555555-5555-4555-8555-555555555555'
\set mallory '66666666-6666-4666-8666-666666666666'

begin;

-- ─── OUTILLAGE ───────────────────────────────────────────────
create or replace function pg_temp.assert(p_ok boolean, p_label text)
  returns void
  language plpgsql
as $$
begin
  if p_ok is not true then
    raise exception 'ÉCHEC — %', p_label;
  end if;
  raise notice 'ok — %', p_label;
end;
$$;

-- Rejoint en se faisant passer pour `p_uid`, sous le rôle `authenticated` :
-- le grant d'exécution fait partie de ce qu'on teste. Renvoie « joined »,
-- « null » (code inconnu, essai compté) ou le message d'erreur métier.
create function pg_temp.join_as(p_uid uuid, p_identifier text)
  returns text
  language plpgsql
as $$
declare
  v_session public.sessions;
  v_result  text;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  begin
    v_session := public.join_session(p_identifier);
    v_result := case when v_session.id is null then 'null' else 'joined' end;
  exception
    when others then
      v_result := sqlerrm;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_result;
end;
$$;

create function pg_temp.failures(p_uid uuid)
  returns integer
  language sql
as $$
  select count(*)::integer from public.join_attempts where user_id = p_uid;
$$;

-- ─── FIXTURES ────────────────────────────────────────────────
-- Le trigger `on_auth_user_created` crée les profils à partir des metadata.
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'host', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Hôte"}'::jsonb, true),
  (:'sam', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Sam"}'::jsonb, true),
  (:'mallory', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Mallory"}'::jsonb, true);

insert into public.sessions (name, host_id, status, invite_code)
values ('Midi du vendredi', :'host', 'waiting', 'ABC123');

-- ─── 1. UN ESSAI RATÉ EST COMPTÉ, SANS EXCEPTION ─────────────
select pg_temp.assert(
  pg_temp.join_as(:'sam', 'ZZZZZ1') = 'null',
  'un code inconnu renvoie NULL au lieu de lever'
);
select pg_temp.assert(
  pg_temp.failures(:'sam') = 1,
  'l’essai raté survit à l’appel : il est bien journalisé'
);

-- Une saisie qui n'a même pas le bon format compte aussi : c'est un essai.
select pg_temp.assert(
  pg_temp.join_as(:'sam', 'nope') = 'null',
  'une saisie malformée renvoie NULL elle aussi'
);
select pg_temp.assert(pg_temp.failures(:'sam') = 2, 'deux essais ratés au compteur');

-- ─── 2. DEUX FAUTES DE FRAPPE NE BLOQUENT JAMAIS ─────────────
select pg_temp.assert(
  pg_temp.join_as(:'sam', 'abc-123') = 'joined',
  'après deux erreurs, le bon code fait toujours entrer'
);
select pg_temp.assert(
  pg_temp.failures(:'sam') = 0,
  'un code juste efface l’ardoise'
);
select pg_temp.assert(
  exists (
    select 1 from public.session_participants sp
    join public.sessions s on s.id = sp.session_id
    where s.invite_code = 'ABC123' and sp.profile_id = :'sam'
  ),
  'sam est bien inscrit dans la session'
);

-- ─── 3. AU 11ᵉ ESSAI RATÉ, C'EST NON ─────────────────────────
do $$
declare
  i integer;
begin
  for i in 1..10 loop
    perform pg_temp.assert(
      pg_temp.join_as('66666666-6666-4666-8666-666666666666', 'ZZZZ' || lpad(i::text, 2, '0')) = 'null',
      format('essai raté n° %s : encore toléré', i)
    );
  end loop;
end;
$$;

select pg_temp.assert(pg_temp.failures(:'mallory') = 10, 'dix essais ratés au compteur');
select pg_temp.assert(
  pg_temp.join_as(:'mallory', 'ZZZZ11') = 'omk:too_many_attempts',
  'le 11ᵉ essai est refusé'
);
select pg_temp.assert(
  pg_temp.failures(:'mallory') = 10,
  'un essai refusé n’alourdit pas le compteur'
);

-- Même le bon code est refusé tant que la fenêtre n'est pas passée : c'est le
-- prix à payer pour que la limite serve à quelque chose.
select pg_temp.assert(
  pg_temp.join_as(:'mallory', 'ABC123') = 'omk:too_many_attempts',
  'le blocage ne se contourne pas avec un code valide'
);

-- ─── 4. LE COMPTEUR EST PROPRE À CHACUN ──────────────────────
select pg_temp.assert(
  pg_temp.join_as(:'host', 'ZZZZZ9') = 'null',
  'le blocage de mallory ne déborde pas sur les autres'
);
delete from public.join_attempts where user_id = :'host';

-- ─── 5. LA FENÊTRE GLISSE ────────────────────────────────────
update public.join_attempts
  set attempted_at = now() - interval '11 minutes'
  where user_id = :'mallory';

select pg_temp.assert(
  pg_temp.join_as(:'mallory', 'ABC123') = 'joined',
  'passé dix minutes, les essais d’avant ne comptent plus'
);

-- ─── 6. PURGE ────────────────────────────────────────────────
insert into public.join_attempts (user_id, attempted_at)
values
  (:'mallory', now() - interval '2 days'),
  (:'mallory', now() - interval '30 minutes');

do $$
declare
  v_ok boolean := false;
begin
  begin
    perform public.purge_join_attempts(interval '5 minutes');
  exception
    when others then
      v_ok := true;
  end;
  perform pg_temp.assert(v_ok, 'une rétention plus courte que la fenêtre est refusée');
end;
$$;

select pg_temp.assert(
  public.purge_join_attempts(interval '1 day') = 1,
  'seul l’essai vieux de deux jours est purgé'
);
select pg_temp.assert(
  pg_temp.failures(:'mallory') = 1,
  'l’essai d’il y a trente minutes est conservé'
);
select pg_temp.assert(
  exists (select 1 from public.maintenance_runs where task = 'purge_join_attempts'),
  'la purge est journalisée comme les autres'
);

-- ─── 7. LE JOB NOCTURNE PORTE LE NOUVEAU COMPTEUR ────────────
select pg_temp.assert(
  public.run_maintenance() ? 'join_attempts',
  'run_maintenance renvoie le compteur des essais'
);

-- ─── 8. LA TABLE RESTE HORS DE PORTÉE DE L'APP ───────────────
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.join_attempts', 'select')
    and not has_table_privilege('anon', 'public.join_attempts', 'select'),
  'ni anon ni authenticated ne lisent le journal des essais'
);

do $$
begin
  raise notice 'Scénario de limitation de débit : toutes les assertions passent.';
end;
$$;

rollback;
