# Lancer la stack en local

## Prérequis

- Docker Desktop démarré
- Bun ≥ 1.3
- Supabase CLI ≥ 2.x

## 1) Installer les dépendances

```bash
bun install
```

## 2) Configurer les variables d'environnement

```bash
cp .env.local.example .env.local
```

| Variable                               | Valeur locale                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `http://127.0.0.1:54321` (affichée par `supabase start`)                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la _publishable key_ (ou l'ancienne _anon key_)                                         |
| `NEXT_PUBLIC_SITE_URL`                 | optionnelle — `http://localhost:3000` par défaut ; déduite des variables Vercel en prod |
| `GOOGLE_PLACES_API_KEY`                | optionnelle — active l'onglet « Google » du sélecteur de restos (serveur uniquement)    |
| `NEXT_PUBLIC_POSTHOG_KEY`              | optionnelle — **à laisser vide en local** : sans elle, aucune mesure n'est chargée      |
| `NEXT_PUBLIC_POSTHOG_HOST`             | optionnelle — `https://eu.i.posthog.com` par défaut                                     |

Les variables sont validées au démarrage (`src/env.ts`) : une valeur manquante fait échouer l'app immédiatement plutôt que silencieusement. Les deux variables PostHog font exception — elles sont optionnelles, et leur absence désactive complètement la mesure (voir [`analytics.md`](analytics.md)).

## 3) Démarrer Supabase local

```bash
supabase start
```

Les migrations de `supabase/migrations/` sont appliquées et la base de restaurants est seedée. Les emails (confirmation d'adresse pour le compte optionnel) arrivent dans Inbucket : `http://127.0.0.1:54324`.

## 4) Lancer l'app Next.js

```bash
bun run dev
```

L'app démarre sur `http://localhost:3000`.

## Commandes utiles

| Commande            | Effet                                                               |
| ------------------- | ------------------------------------------------------------------- |
| `bun run check`     | typecheck + lint + format + tests unitaires (ce que fait la CI)     |
| `bun run test`      | tests unitaires et composants (Vitest)                              |
| `bun run test:e2e`  | flow complet host + invité avec Playwright (`E2E=1`, stack locale)  |
| `bun run build`     | build de production                                                 |
| `bun run db:types`  | régénère `src/data-access/models/database.ts` depuis la base locale |
| `bun run db:test`   | rejoue les scénarios SQL de `supabase/tests/` (`psql` requis)       |
| `supabase db reset` | rejoue toutes les migrations et le seed                             |
| `supabase stop`     | arrête la stack                                                     |

Ces commandes ont un équivalent lançable depuis GitHub, sans terminal : Actions → « Base de données » → _Run workflow_, puis `check`, `types`, `pull`, `plan` ou `push`. Détail dans [`docs/ci-database.md`](ci-database.md).

## Tests de bout en bout

```bash
supabase start
bun run build
E2E=1 bun run test:e2e
```

Le spec `e2e/full-flow.spec.ts` ouvre deux navigateurs (host et invité), crée une session, rejoint par code, vote avec les jokers et vérifie le classement. Sans `E2E=1`, il est ignoré.

## Routes et codes

Toutes les URL de l'app sont construites via `router.*()` dans `src/config/router.config.ts` (jamais de chaîne `'/sessions/...'` en dur). Le fichier expose aussi les préfixes protégés — `src/proxy.ts` doit les répéter dans son `matcher` littéral, ce que vérifie `router.config.test.ts`.

Les codes d'invitation (6) et de partage de liste (10) sont en Crockford base32 : `src/lib/crockford.ts` normalise la saisie côté client, `public.normalize_crockford` fait de même en base.

Toutes les ressources s'adressent par leur code (`/sessions/7K3M9P`, `/lists/H4V2Q8ZX0M`, `/l/…`, `/join/…`), jamais par uuid :

- `codeFromSegment(segment, longueur)` (`src/lib/crockford.ts`) lit le code d'un segment d'URL ; il tolère la saisie humaine et les anciens liens décorés d'un slug (`restos-du-bureau-H4V2Q8ZX0M`) ;
- `parseSessionParam` / `parseListParam` (`src/lib/share.ts`) rendent `{ kind: 'code' | 'id' | 'invalid' }` : `id` couvre les anciens liens en uuid, que la page redirige vers la forme courte ;
- `router.session(session)` / `router.list(list)` prennent la ligne et non l'id : une URL ne peut pas se construire sans son code ;
- côté données, `getSessionByParam` et `getListByParam` choisissent la colonne (`invite_code` / `share_code` ou `id`). La RLS filtre exactement comme pour une lecture par id : le code dans l'URL n'ouvre aucun accès.

Une action qui ne connaît qu'un uuid ne peut donc pas viser une page précise : elle invalide la route entière avec `revalidatePath(ROUTE_PATTERNS.list, 'page')`.

Sans `GOOGLE_PLACES_API_KEY`, l'import Google est simplement absent de l'interface : rien d'autre ne change, et aucun test n'en dépend. Pour l'essayer en local, créer une clé dans Google Cloud avec l'API « Places API (New) » activée, puis la restreindre à cette seule API.

Les restaurants ajoutés depuis l'app portent `source = 'manual'` et `created_by` ; la RPC `create_manual_restaurant` pose les deux et les policies RLS empêchent de les contourner. `find_similar_restaurants` sert l'avertissement de doublon (pg_trgm, seuil 0.45). Les restos importés de Google portent `source = 'google'` et un `place_id` unique : `upsert_restaurant_from_place` est idempotente, la rejouer ne crée jamais de seconde ligne.

## Valider les migrations sans Supabase

Les fonctions et policies peuvent être validées sur un PostgreSQL 16 nu en recréant le minimum de l'environnement Supabase (rôles `anon` / `authenticated`, schéma `auth` avec `auth.uid()` et une table `auth.users`, extensions `pgcrypto` et `pg_trgm` dans le schéma `extensions`, publication `supabase_realtime`). C'est ce qui a servi à tester les RPC de vote et de classement, puis les scénarios ci-dessus.

Le shim doit rester fidèle sur les points qui piègent : `auth.users.id` n'a **pas** de valeur par défaut — c'est GoTrue qui la fournit —, et `auth.identities` exige `provider_id` et `identity_data`. Un shim plus permissif fait passer un scénario qui échouera sur la vraie base.

## Entretien

Les visiteurs qui choisissent un pseudo sans jamais lier d'email restent des utilisateurs anonymes : sans purge, `auth.users` et `sessions` grossissent à chaque session. Le nettoyage est automatisé par la migration `20260905120000_purge_inactive_anonymous.sql`.

| Fonction                                                                 | Rétention par défaut | Ce qui est supprimé                                                 |
| ------------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------- |
| `public.purge_inactive_anonymous(p_older_than)`                          | 90 jours             | les anonymes sans aucune activité ni moyen de reconnexion           |
| `public.purge_stale_sessions(p_waiting_older_than, p_closed_older_than)` | 7 et 180 jours       | les sessions `waiting` jamais lancées, les sessions `closed` âgées  |
| `public.run_maintenance()`                                               | —                    | enchaîne les deux, dans cet ordre ; cible du job `pg_cron` nocturne |

Un compte n'est purgé que s'il ne peut plus jamais être retrouvé : **une adresse email liée — même en attente de confirmation —, un changement d'email en cours, un téléphone ou une identité externe le protègent définitivement**. Sont également conservés les comptes dont la création ou la dernière connexion est récente, ceux qui ont hébergé ou rejoint une session récemment, et ceux qui participent à une session non clôturée, quelle que soit son ancienneté. La suppression d'un anonyme emporte en cascade son profil et ses listes. Ses sessions, elles, survivent sans host (`sessions.host_id` et `session_participants.profile_id` sont en `on delete set null` depuis la suppression de compte RGPD) : purger un compte n'efface jamais un classement déjà affiché à d'autres. Les sessions closes finissent par partir via `purge_stale_sessions`.

`run_maintenance()` est planifiée à 3 h 17 UTC par `pg_cron` (job `omk-nightly-maintenance`). La migration ne casse pas là où l'extension est absente — un PostgreSQL nu, un plan sans `pg_cron` — elle émet un `NOTICE` et laisse l'appel manuel possible :

```sql
select public.run_maintenance();
select cron.schedule('omk-nightly-maintenance', '17 3 * * *', 'select public.run_maintenance()');
```

Chaque passage écrit une ligne dans `public.maintenance_runs` (tâche, durée, compteurs en JSON) et une trace dans les logs Postgres. Le journal se purge lui-même au-delà d'un an. La table n'est exposée ni à `anon` ni à `authenticated` :

```sql
select ran_at, task, purged from public.maintenance_runs order by ran_at desc limit 10;
```

Les intervalles sont paramétrables à l'appel, avec un plancher d'un jour ; passer `null` à `purge_stale_sessions` conserve la catégorie concernée — c'est le levier à utiliser le jour où les sessions closes alimenteront un historique consultable.

## Scénarios SQL

`supabase/tests/*.test.sql` contient des scénarios exécutés par `psql`, chacun dans une transaction annulée à la fin : ils ne laissent aucune donnée derrière eux et une assertion fausse fait sortir `psql` en erreur.

```bash
supabase start
bun run db:test
```

| Scénario                  | Ce qu'il prouve                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `purge.test.sql`          | Purge : protections d'un compte joignable, cascades, compteurs, garde-fous de rétention                                      |
| `delete-account.test.sql` | Suppression RGPD : classement d'une session close inchangé, votes anonymisés, sessions orphelines traitées, export cloisonné |

`SUPABASE_DB_URL` permet de viser une autre base que la locale (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), y compris le PostgreSQL nu décrit plus haut. La CI les rejoue dans le job `End-to-end`, juste après `supabase start`.

## RGPD

| Droit                          | Où                                         | Ce qui se passe                                                                                          |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Accès et portabilité (art. 20) | `/account/export` → RPC `export_my_data()` | Un JSON assemblé en base, filtré sur `auth.uid()`, téléchargé à la demande                               |
| Effacement (art. 17)           | « Mon compte » → RPC `delete_my_account()` | Profil, listes et compte auth supprimés ; votes des sessions closes conservés en agrégat mais anonymisés |
| Information                    | `/legal/privacy`                           | Données conservées, durées, sous-traitants                                                               |

Les deux RPC ne prennent aucun paramètre : leur périmètre est toujours `auth.uid()`. Elles sont `security definer` parce qu'elles touchent `auth.users`, et doivent donc appartenir à un rôle autorisé sur ce schéma — `postgres`, celui qui joue les migrations.
