-- ============================================================
-- onmangekoi — scénario : les apps connectées ne touchent pas au compte
-- ============================================================
-- Un jeton OAuth (claim `client_id`, celui d'une app connectée via le
-- serveur MCP) ne peut ni supprimer le compte ni exporter ses données ; le
-- même utilisateur, depuis l'app (jeton sans `client_id`), le peut toujours.
--
-- Exécution : bun run db:test (base locale, `supabase start` en cours).
-- Transaction terminée par ROLLBACK : rien ne reste en base.
-- ============================================================

\set ON_ERROR_STOP on

\set alice '44444444-4444-4444-8444-444444444444'
\set client '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'

begin;

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

-- Le profil est créé par le trigger d'inscription, depuis `raw_user_meta_data`.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  (:'alice', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@example.test', '{"pseudo":"Alice"}'::jsonb);

select pg_temp.assert(
  exists (select 1 from public.profiles where id = :'alice'),
  'le profil d''Alice existe'
);

-- ─── Avec le jeton d'une app connectée ───────────────────────

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"' || :'alice' || '","role":"authenticated","client_id":"' || :'client' || '"}',
  true
);

select pg_temp.assert(public.is_oauth_client_request(), 'le jeton OAuth est reconnu');

do $$
begin
  perform public.export_my_data();
  raise exception 'ÉCHEC — export_my_data aurait dû être refusé';
exception when others then
  if sqlerrm <> 'omk:forbidden_for_connected_apps' then raise; end if;
  raise notice 'ok — export refusé à une app connectée';
end;
$$;

do $$
begin
  perform public.delete_my_account();
  raise exception 'ÉCHEC — delete_my_account aurait dû être refusé';
exception when others then
  if sqlerrm <> 'omk:forbidden_for_connected_apps' then raise; end if;
  raise notice 'ok — suppression refusée à une app connectée';
end;
$$;

do $$
begin
  perform public.delete_my_account_unguarded();
  raise exception 'ÉCHEC — la fonction interne ne doit pas être appelable';
exception when insufficient_privilege then
  raise notice 'ok — la fonction interne reste hors de portée de l''API';
end;
$$;

-- ─── Avec le jeton de l'app ──────────────────────────────────

select set_config('request.jwt.claims', '{"sub":"' || :'alice' || '","role":"authenticated"}', true);

select pg_temp.assert(not public.is_oauth_client_request(), 'le jeton web n''est pas un client OAuth');
select pg_temp.assert(public.export_my_data() is not null, 'l''export reste possible depuis l''app');
select public.delete_my_account();

reset role;
select pg_temp.assert(
  not exists (select 1 from public.profiles where id = :'alice'),
  'la suppression reste possible depuis l''app'
);

rollback;
