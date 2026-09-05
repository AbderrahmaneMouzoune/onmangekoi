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

Les variables sont validées au démarrage (`src/env.ts`) : une valeur manquante fait échouer l'app immédiatement plutôt que silencieusement.

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

Les codes d'invitation (6) et de partage de liste (10) sont en Crockford base32 : `src/lib/crockford.ts` normalise la saisie côté client, `public.normalize_crockford` fait de même en base. Les liens de liste ont la forme `/l/<slug>-<CODE>` ; `parseSharedListParam` ne garde que le code final.

## Scénarios SQL

`supabase/tests/` contient des scénarios rejouables directement en SQL, pour ce qui se vérifie mieux en base que dans un test de composant.

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -v ON_ERROR_STOP=1 -f supabase/tests/delete_my_account.sql
```

| Scénario                | Ce qu'il prouve                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `delete_my_account.sql` | Suppression RGPD : classement d'une session close inchangé, votes anonymisés, sessions orphelines traitées, export cloisonné |

Chaque scénario tient dans une transaction terminée par `rollback` : il ne laisse rien en base, et la moindre assertion fausse interrompt le script.

## Valider les migrations sans Supabase

Les fonctions et policies peuvent être validées sur un PostgreSQL 16 nu en recréant le minimum de l'environnement Supabase (rôles `anon` / `authenticated`, schéma `auth` avec `auth.uid()` et une table `auth.users`, extensions `pgcrypto` et `pg_trgm` dans le schéma `extensions`, publication `supabase_realtime`). C'est ce qui a servi à tester les RPC de vote et de classement, puis les scénarios ci-dessus.

## Entretien

Les visiteurs qui choisissent un pseudo sans jamais lier d'email restent des utilisateurs anonymes. Pour purger ceux qui n'ont plus d'activité :

```sql
delete from auth.users
where is_anonymous is true
  and created_at < now() - interval '90 days'
  and id not in (
    select host_id from public.sessions
    where host_id is not null
      and created_at > now() - interval '90 days'
  );
```

Le filtre `host_id is not null` n'est pas cosmétique : `host_id` est nullable depuis la suppression de compte RGPD, et un seul NULL dans un `not in` rend la condition entière nulle — la purge ne supprimerait plus personne.

Cette purge ne détruit pas les classements : `sessions.host_id` et `session_participants.profile_id` sont en `on delete set null`, donc supprimer un compte — depuis l'app, depuis le dashboard Supabase ou par cette requête — anonymise ses votes au lieu de les effacer.

## RGPD

| Droit                          | Où                                         | Ce qui se passe                                                                                          |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Accès et portabilité (art. 20) | `/account/export` → RPC `export_my_data()` | Un JSON assemblé en base, filtré sur `auth.uid()`, téléchargé à la demande                               |
| Effacement (art. 17)           | « Mon compte » → RPC `delete_my_account()` | Profil, listes et compte auth supprimés ; votes des sessions closes conservés en agrégat mais anonymisés |
| Information                    | `/legal/privacy`                           | Données conservées, durées, sous-traitants                                                               |

Les deux RPC ne prennent aucun paramètre : leur périmètre est toujours `auth.uid()`. Elles sont `security definer` parce qu'elles touchent `auth.users`, et doivent donc appartenir à un rôle autorisé sur ce schéma — `postgres`, celui qui joue les migrations.
