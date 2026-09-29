-- ============================================================
-- onmangekoi — scénario : notifications push
-- ============================================================
-- Vérifie les critères de l'issue #7 côté base :
--   * un abonnement n'est visible et supprimable que par son propriétaire ;
--     l'écriture passe par `save_push_subscription`, qui valide, reprend un
--     endpoint changé de main et plafonne le nombre d'appareils ;
--   * sans les secrets du Vault, le trigger ne fait rien — c'est le cas en
--     local et en CI ;
--   * avec eux, le lancement et la clôture enfilent un appel `pg_net` vers
--     la route d'envoi, avec le secret en en-tête et, dans le corps, la
--     session, le nouveau statut et l'auteur du changement ;
--   * pas d'appel quand seul l'auteur est abonné, ni à la création d'une
--     session ouverte (elle naît en `voting`, sans personne à prévenir) ;
--   * la clôture à l'échéance n'a pas d'auteur ;
--   * chaque abonnement retient sa langue (issue #14) : `fr` par défaut et
--     pour un appel à trois arguments, `en` sur demande, rien d'autre ; un
--     rappel la met à jour ;
--   * l'export RGPD liste les abonnements et leur langue, la suppression du
--     compte les emporte.
--
-- Exécution (base Supabase locale, `supabase start` en cours) :
--   bun run db:test        — rejoue tous les scénarios de supabase/tests
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/push.test.sql
--
-- Le script tient dans une transaction terminée par ROLLBACK : il ne laisse
-- rien en base — ni secret dans le Vault, ni requête dans la file de pg_net,
-- que le worker ne voit qu'une fois la transaction validée.
-- ============================================================

\set ON_ERROR_STOP on

\set host  'b1111111-1111-4111-8111-111111111111'
\set guest 'b2222222-2222-4222-8222-222222222222'
\set other 'b3333333-3333-4333-8333-333333333333'

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

-- Exécute un appel et renvoie le message d'erreur levé, ou null s'il passe.
create or replace function pg_temp.error_of(p_sql text)
  returns text
  language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception
  when others then return sqlerrm;
end;
$$;

-- Joue un bloc sous l'identité d'un utilisateur connecté.
create or replace function pg_temp.login(p_uid uuid)
  returns void
  language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- ─── FIXTURES ────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, is_anonymous)
values
  (:'host', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Hôte"}'::jsonb, true),
  (:'guest', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Invité"}'::jsonb, true),
  (:'other', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '{"pseudo":"Voisin"}'::jsonb, true);

create temporary table t_resto as
select id, row_number() over (order by name) as ord
from (select id, name from public.restaurants order by name limit 2) s;

create temporary table t_sessions (label text primary key, id uuid not null, code text not null);

grant select on t_resto to authenticated;
grant select, insert on t_sessions to authenticated;

-- Les appels enfilés pendant ce scénario, corps décodé.
create temporary view t_calls as
select q.id, q.url, q.headers, convert_from(q.body, 'UTF8')::jsonb as body
from net.http_request_queue q
where q.id > coalesce(current_setting('omk_test.queue_floor', true), '0')::bigint;

select set_config('omk_test.queue_floor', coalesce(max(id), 0)::text, true)
from net.http_request_queue;

-- ============================================================
-- 1. Abonnement : RPC, validation, RLS propriétaire
-- ============================================================
set local role authenticated;
select pg_temp.login(:'guest');

do $$
begin
  raise notice '1. abonnement';

  perform public.save_push_subscription('https://push.example.test/guest', 'BNcRdreALRFX', 'tBHItJI5svbpez7KI4CCXg');
  -- Rappelée à chaque passage en salle d'attente : aucun doublon.
  perform public.save_push_subscription('https://push.example.test/guest', 'BNcRdreALRFX', 'tBHItJI5svbpez7KI4CCXg');
  perform pg_temp.assert(
    (select count(*) from public.push_subscriptions) = 1,
    'l''abonnement est enregistré une fois, même rappelé'
  );

  perform pg_temp.assert(
    pg_temp.error_of($sql$ select public.save_push_subscription('http://push.example.test/x', 'abc', 'def') $sql$)
      = 'omk:invalid_push_subscription',
    'un endpoint hors HTTPS est refusé'
  );
  perform pg_temp.assert(
    pg_temp.error_of($sql$ select public.save_push_subscription('https://push.example.test/x', 'a b', 'def') $sql$)
      = 'omk:invalid_push_subscription',
    'une clé qui n''est pas du base64url est refusée'
  );
  perform pg_temp.assert(
    pg_temp.error_of($sql$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
      values (auth.uid(), 'https://push.example.test/direct', 'abc', 'def') $sql$) is not null,
    'pas d''insertion directe : l''écriture passe par la RPC'
  );

  -- Langue (#14) : un appel à trois arguments garde le français d'avant.
  perform pg_temp.assert(
    (select locale from public.push_subscriptions
     where endpoint = 'https://push.example.test/guest') = 'fr',
    'sans langue précisée, un abonnement parle français'
  );
  perform public.save_push_subscription('https://push.example.test/guest', 'BNcRdreALRFX', 'tBHItJI5svbpez7KI4CCXg', 'en');
  perform pg_temp.assert(
    (select locale from public.push_subscriptions
     where endpoint = 'https://push.example.test/guest') = 'en'
      and (select count(*) from public.push_subscriptions) = 1,
    'un rappel dans une autre langue met la langue à jour, sans doublon'
  );
  perform pg_temp.assert(
    pg_temp.error_of($sql$ select public.save_push_subscription('https://push.example.test/x', 'abc', 'def', 'de') $sql$)
      = 'omk:invalid_push_subscription',
    'une langue que l''app ne parle pas est refusée'
  );
  perform pg_temp.assert(
    pg_temp.error_of($sql$ select public.save_push_subscription('https://push.example.test/x', 'abc', 'def', null) $sql$)
      = 'omk:invalid_push_subscription',
    'une langue nulle est refusée'
  );
end;
$$;

select pg_temp.login(:'other');

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.push_subscriptions) = 0,
    'les abonnements d''un autre sont invisibles'
  );
  delete from public.push_subscriptions;
end;
$$;

reset role;

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.push_subscriptions where user_id = 'b2222222-2222-4222-8222-222222222222') = 1,
    'ni supprimables par un autre'
  );
end;
$$;

set local role anon;
select pg_temp.assert(
  pg_temp.error_of($sql$ select public.save_push_subscription('https://push.example.test/anon', 'abc', 'def') $sql$) is not null,
  'un visiteur sans compte ne peut pas s''abonner'
);
reset role;

-- Changement de main : le voisin s'abonne sur le navigateur de l'invité.
set local role authenticated;
select pg_temp.login(:'other');
select public.save_push_subscription('https://push.example.test/guest', 'BNcRdreALRFX', 'tBHItJI5svbpez7KI4CCXg');
reset role;

select pg_temp.assert(
  (select user_id from public.push_subscriptions where endpoint = 'https://push.example.test/guest')
    = :'other'::uuid,
  'un navigateur repris par quelqu''un d''autre change de main'
);

-- Plafond : 12 appareils déjà enregistrés — celui repris à l'invité, et 11
-- plus anciens posés hors RPC —, un 13ᵉ s'abonne : les 10 plus récents restent.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
select :'other', 'https://push.example.test/other-' || i, 'abc', 'def', now() - (100 - i) * interval '1 minute'
from generate_series(1, 11) as i;

set local role authenticated;
select pg_temp.login(:'other');
select public.save_push_subscription('https://push.example.test/other-12', 'abc', 'def');
reset role;

select pg_temp.assert(
  (select count(*) from public.push_subscriptions where user_id = :'other') = 10,
  'au-delà de 10 appareils, les plus anciens cèdent la place'
);
select pg_temp.assert(
  not exists (select 1 from public.push_subscriptions
              where endpoint in ('https://push.example.test/other-1',
                                 'https://push.example.test/other-2',
                                 'https://push.example.test/other-3'))
    and (select count(*) from public.push_subscriptions
         where endpoint in ('https://push.example.test/guest',
                            'https://push.example.test/other-12')) = 2,
  'les plus récents sont gardés, les trois plus anciens partent'
);

-- On repart d'un état simple : l'invité seul abonné.
delete from public.push_subscriptions where user_id = :'other';
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values (:'guest', 'https://push.example.test/guest', 'BNcRdreALRFX', 'tBHItJI5svbpez7KI4CCXg');

-- ============================================================
-- 2. Sans secrets dans le Vault : aucun appel
-- ============================================================
set local role authenticated;
select pg_temp.login(:'host');

do $$
declare
  v_ids uuid[] := (select array_agg(id order by ord) from t_resto);
  v_session public.sessions;
begin
  raise notice '2. sans secrets';
  v_session := public.create_session('Sans secrets', v_ids);
  insert into t_sessions values ('no_secrets', v_session.id, v_session.invite_code);
  v_session := public.create_session('Midi de mardi', v_ids);
  insert into t_sessions values ('tuesday', v_session.id, v_session.invite_code);
  v_session := public.create_session('Seul abonné', v_ids);
  insert into t_sessions values ('actor_only', v_session.id, v_session.invite_code);
end;
$$;

select pg_temp.login(:'guest');
select public.join_session((select code from t_sessions where label = 'no_secrets'));
select public.join_session((select code from t_sessions where label = 'tuesday'));
select public.join_session((select code from t_sessions where label = 'actor_only'));

select pg_temp.login(:'host');
select public.launch_session((select id from t_sessions where label = 'no_secrets'));
reset role;

select pg_temp.assert(
  (select count(*) from t_calls) = 0,
  'sans secrets dans le Vault, le lancement n''appelle rien'
);

-- ============================================================
-- 3. Avec les secrets : lancement, clôture, auteur
-- ============================================================
select vault.create_secret('https://onmangekoi.test/api/push/dispatch', 'push_dispatch_url');
select vault.create_secret('s3cr3t-partage', 'push_dispatch_secret');

set local role authenticated;
select pg_temp.login(:'host');
select public.launch_session((select id from t_sessions where label = 'tuesday'));
reset role;

select pg_temp.assert(
  (select count(*) from t_calls) = 1,
  'le lancement enfile un appel vers la route d''envoi'
);
select pg_temp.assert(
  (select url from t_calls) = 'https://onmangekoi.test/api/push/dispatch',
  'l''URL vient du Vault'
);
select pg_temp.assert(
  (select headers ->> 'Authorization' from t_calls) = 'Bearer s3cr3t-partage',
  'le secret partagé part en en-tête'
);
select pg_temp.assert(
  (select body from t_calls) = jsonb_build_object(
    'session_id', (select id from t_sessions where label = 'tuesday'),
    'status', 'voting',
    'actor_id', :'host'::uuid
  ),
  'le corps ne porte que la session, le statut et l''auteur'
);

-- Clôture par le host : un second appel, statut `closed`.
set local role authenticated;
select pg_temp.login(:'host');
select public.close_session((select id from t_sessions where label = 'tuesday'));
reset role;

select pg_temp.assert(
  (select count(*) from t_calls) = 2
    and (select body ->> 'status' from t_calls order by id desc limit 1) = 'closed',
  'la clôture enfile un appel au statut closed'
);

-- Seul l'auteur est abonné : personne à prévenir, pas d'appel.
update public.push_subscriptions set user_id = :'host' where endpoint = 'https://push.example.test/guest';
set local role authenticated;
select pg_temp.login(:'host');
select public.launch_session((select id from t_sessions where label = 'actor_only'));
reset role;

select pg_temp.assert(
  (select count(*) from t_calls) = 2,
  'l''auteur du changement n''est pas prévenu : sans autre abonné, aucun appel'
);

-- Clôture à l'échéance, par le job : pas d'auteur, l'hôte est prévenu.
select set_config('request.jwt.claims', '', true);
update public.sessions set closes_at = now() - interval '1 minute'
where id = (select id from t_sessions where label = 'actor_only');
select public.close_expired_sessions();

select pg_temp.assert(
  (select count(*) from t_calls) = 3
    and (select body from t_calls order by id desc limit 1) = jsonb_build_object(
      'session_id', (select id from t_sessions where label = 'actor_only'),
      'status', 'closed',
      'actor_id', null
    ),
  'la clôture à l''échéance n''a pas d''auteur : tout le monde est prévenu'
);

-- Une session ouverte naît en `voting` : pas de changement de statut, pas d'appel.
set local role authenticated;
select pg_temp.login(:'guest');
select public.create_session(
  'Ouverte', (select array_agg(id order by ord) from t_resto), now() + interval '1 hour', '{"open": true}'::jsonb
);
reset role;

select pg_temp.assert(
  (select count(*) from t_calls) = 3,
  'la création d''une session ouverte ne prévient personne'
);

-- ============================================================
-- 4. RGPD : export et suppression du compte
-- ============================================================
set local role authenticated;
select pg_temp.login(:'host');

do $$
declare
  v_export jsonb := public.export_my_data();
begin
  raise notice '4. RGPD';
  perform pg_temp.assert(
    v_export -> 'push_subscriptions' -> 0 ->> 'endpoint' = 'https://push.example.test/guest'
      and not (v_export -> 'push_subscriptions' -> 0 ? 'auth'),
    'l''export liste les abonnements, sans leurs clés'
  );
  perform pg_temp.assert(
    v_export -> 'push_subscriptions' -> 0 ->> 'locale' = 'fr',
    'l''export dit la langue de chaque abonnement'
  );
  perform pg_temp.assert(
    v_export ? 'hosted_sessions' and v_export ? 'pending_invitations' and v_export ? 'groups',
    'l''export garde tout ce qu''il contenait avant'
  );
  perform public.delete_my_account();
end;
$$;
reset role;

select pg_temp.assert(
  not exists (select 1 from public.push_subscriptions where user_id = :'host'),
  'la suppression du compte emporte ses abonnements'
);

rollback;
