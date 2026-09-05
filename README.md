# 🍴 onmangekoi

> Voter où manger avec ses collègues et amis, sans perdre 10 minutes à « je sais pas, comme tu veux ».

## Le principe

1. Tu choisis des restaurants — dans la base, ou dans une de tes **listes** de favoris
2. Tu lances une **session**, tu envoies le code ou le lien au groupe — ou tu fais scanner le **QR code**
3. Chacun vote dans son coin, carte par carte : **bof** · **ça me va** · **coup de cœur** · **veto**
4. Quand tout le monde a voté (ou que le host clôture), le **classement** s'affiche

**Zéro friction** : tout est utilisable avec un simple pseudo. Lier un email et un mot de passe est optionnel et ne sert qu'à retrouver ses listes depuis un autre appareil.

## Système de vote

| Action       | Valeur | Contrainte              |
| ------------ | ------ | ----------------------- |
| Bof          | 0      | Illimité                |
| Ça me va     | +1     | Illimité                |
| Coup de cœur | +2     | **1 joker par session** |
| Veto         | −2     | **1 joker par session** |

`Score(restaurant) = Σ des votes`. Les votes manquants comptent 0. En cas d'égalité, le nombre de coups de cœur départage ; à égalité parfaite, le classement l'annonce.

Les règles (jokers, session en cours, participant, restaurant valide) sont vérifiées **en base** par la fonction `submit_vote`, pas seulement dans l'interface.

## Règles de session

| Règle               | Comportement                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| Lancement           | Réservé au host, à partir de 2 participants                                     |
| Snapshot            | Les restaurants sont figés à la création                                        |
| Votes privés        | Chacun ne lit que ses votes ; le classement est une agrégation                  |
| Clôture automatique | Déclenchée en base dès que 100 % des participants ont terminé                   |
| Clôture forcée      | Le host peut clôturer à tout moment — les votes manquants comptent 0            |
| Vue host            | Qui a terminé, en temps réel (statut uniquement, jamais les votes)              |
| Rejoindre           | Impossible une fois le vote lancé ; un participant existant retrouve sa session |

## Codes et liens de partage

| Objet   | Forme                            | Exemple                                          |
| ------- | -------------------------------- | ------------------------------------------------ |
| Session | code de 6 caractères + lien + QR | `7K3 M9P` · `/join/<token>`                      |
| Liste   | code de 10 caractères + lien     | `H4V2Q-8ZX0M` · `/l/restos-du-bureau-H4V2Q8ZX0M` |

Les codes utilisent l'alphabet **Crockford base32** (`0-9`, `A-Z` sans `I`, `L`, `O`, `U`) : pas de lettre ambiguë à l'oral ni à l'écrit. La saisie est tolérante — minuscules, espaces, tirets, `I`/`L` lus comme `1`, `O` comme `0` — et un lien collé entier est accepté. Le segment texte des liens de liste est purement décoratif : seul le code final compte, et l'URL est canonicalisée si le nom change. Les anciens liens à jeton hexadécimal restent valides.

Le code d'invitation peut aussi être **scanné** : la page « Rejoindre » ouvre la caméra (`BarcodeDetector` natif, repli `jsqr`) et lit le QR affiché par le host.

## Stack

| Couche     | Choix                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| Frontend   | Next.js 16 (App Router, Cache Components, Turbopack, `proxy.ts`) · React 19 · TypeScript |
| Routage    | `src/config/router.config.ts` — toutes les URL construites au même endroit               |
| UI         | Tailwind CSS 4 · Base UI · Remix Icon · charte « L'ardoise »                             |
| Données    | Supabase (PostgreSQL 17, RLS, RPC `security definer`)                                    |
| Temps réel | Supabase Realtime (Postgres Changes, resync au retour au premier plan)                   |
| Auth       | Utilisateur anonyme créé au choix du pseudo · email/mot de passe optionnel               |
| Validation | Zod 4 · `@t3-oss/env-nextjs`                                                             |
| Tests      | Vitest 5 + Testing Library · Playwright                                                  |
| Qualité    | ESLint 9 (flat) · Prettier · Husky · commitlint · CI GitHub Actions                      |

## Démarrer

```bash
bun install
cp .env.local.example .env.local   # puis renseigner les valeurs de `supabase start`
supabase start
bun run dev
```

Le détail (variables, tests e2e, régénération des types) est dans [`docs/local-stack.md`](docs/local-stack.md).

## Scripts

| Script             | Rôle                                                |
| ------------------ | --------------------------------------------------- |
| `bun run dev`      | serveur de développement                            |
| `bun run build`    | build de production                                 |
| `bun run check`    | typecheck + lint + format + tests unitaires         |
| `bun run test`     | Vitest (unitaires + composants)                     |
| `bun run test:e2e` | Playwright, flow complet host + invité (`E2E=1`)    |
| `bun run db:types` | régénère les types TypeScript depuis la base locale |

## Architecture

```
src/proxy.ts             rafraîchit la session, protège les routes (redirige vers /setup?next=…)
src/config/              router.config.ts : préfixes protégés, longueurs de codes, `router.*()`
src/app/                 routes App Router (setup, login, join, sessions, lists, l/[slug], account, legal, auth)
src/components/          ui/ (primitives) · layout/ · home/ · session/ · lists/ · account/ · restaurants/ · onboarding/
src/data-access/         requêtes Supabase, un module par table + models/ (types générés)
src/use-cases/           logique métier composée (créer / rejoindre / voter / onboarding)
src/domain/              règles et vocabulaire métier : votes, codes de partage, erreurs, schemas/ (Zod)
src/actions/             Server Actions (validation Zod, auth, revalidate/redirect)
src/lib/                 utilitaires transverses : Crockford, slug, format, routing, site (URL absolues), qr
src/hooks/               Realtime de session, debounce, `useCanShare`, `useIsClient`
supabase/migrations/     schéma, RLS, RPC (create/join/launch/submit_vote/close/results), purge, RGPD
supabase/tests/          scénarios SQL rejoués par `bun run db:test`
e2e/                     Playwright
```

## Rendu et cache

Les **Cache Components** de Next 16 sont activés (`cacheComponents: true`) : chaque route est prérendue sous forme de **coquille statique** — chrome, titres, textes, squelettes — servie immédiatement depuis le cache, pendant que les parties réellement personnelles arrivent en streaming dans leur `<Suspense>`.

| Ce qui est prérendu et mis en cache                                       | Ce qui reste diffusé à chaque requête                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| En-tête, titres, accroche, « comment ça marche », formulaires, squelettes | Pseudo et avatar, sessions, listes, votes, classements, aperçus d'invitation |
| Catalogue de restaurants (`use cache`, 1 h, tag `restaurants`)            | Tout ce qui passe par le client Supabase lié aux cookies                     |

Deux règles tiennent l'ensemble :

- **Rien de personnel n'entre dans un cache partagé.** Le catalogue de restaurants est la seule donnée mise en cache : c'est la seule table lisible par le rôle `anon`, et elle est lue par un client sans cookie (`data-access/supabase/public.ts`). Toutes les autres lectures gardent le client lié à la session, donc restent dans le trou dynamique.
- **Rien qui écrit n'est prérendu.** `/join/[token]` inscrit la personne dans la session avant de rediriger : la coquille n'affiche que « on te fait entrer… », le reste est fait à la requête.

Le catalogue étant partagé, la recherche du sélecteur de restaurants sort du cache elle aussi : une même requête ne touche la base qu'une fois par heure, pour tout le monde. Après un import de restaurants, `revalidateTag(RESTAURANTS_CACHE_TAG)` suffit à le rafraîchir.

## Sécurité

- **Aucune table n'est lisible en `using (true)`.** Les tokens et codes d'invitation ne se résolvent que via des fonctions `security definer` qui prennent le secret en argument et renvoient uniquement la ligne visée.
- **Toutes les écritures métier passent par des RPC** transactionnelles (`create_session`, `join_session`, `launch_session`, `submit_vote`, `close_session`) qui revérifient les règles côté base.
- Les votes individuels ne sont jamais exposés : `session_results` renvoie un agrégat.
- Les codes d'invitation font 6 caractères et les codes de partage de liste 10, sur l'alphabet Crockford base32 (32 symboles, ≈ 1 milliard et ≈ 10¹⁵ combinaisons), tirés uniformément avec `gen_random_bytes` et reprise sur collision.
- Les pages sont rendues avec des chargements parallèles (`Promise.all`) et les lectures par requête sont dédupliquées via `React.cache` (`getCurrentUser`, `getProfile`, `getSessionById`…).
- **Aucune donnée personnelle n'est mise en cache.** Seul le catalogue public de restaurants est mémorisé, via un client Supabase sans cookie ; voir [Rendu et cache](#rendu-et-cache).
- Aucun utilisateur Supabase n'est créé sur une simple visite : uniquement au choix du pseudo.
- Les messages d'erreur Postgres ne remontent jamais tels quels : seuls les codes métier `omk:*` sont traduits.

## Vie privée

L'app est utilisable avec un simple pseudo, et les deux droits qui comptent au quotidien sont en libre-service depuis « Mon compte » :

| Droit                | Chemin            | Effet                                                                                                                       |
| -------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Export (portabilité) | `/account/export` | JSON téléchargeable — profil, listes, sessions hébergées, participations et votes — assemblé en base par `export_my_data()` |
| Suppression          | « Mon compte »    | `delete_my_account()` : profil, listes et compte auth supprimés en une transaction                                          |

Supprimer un compte ne réécrit pas l'histoire des autres. Les votes déjà comptés dans une **session terminée** restent dans le classement mais perdent leur auteur (`Participant supprimé`) ; les sessions **en attente ou en cours** que le compte hébergeait sont supprimées, puisque sans host elles ne peuvent plus aboutir. La garantie est portée par le schéma (`on delete set null` sur `sessions.host_id` et `session_participants.profile_id`), pas seulement par la RPC : une suppression faite depuis le dashboard Supabase donne le même résultat.

Le détail des données conservées et de leurs durées est sur la page `/legal/privacy`, atteignable depuis le pied de page. Le scénario de suppression est rejouable avec `bun run db:test` (`supabase/tests/delete-account.test.sql`).

## Rétention des données

Un pseudo suffit à utiliser l'app, donc chaque pseudo crée un utilisateur anonyme : sans entretien, la base ne fait que grossir. Un job `pg_cron` nocturne (`public.run_maintenance()`) applique la rétention suivante :

| Donnée                             | Conservée | Puis                                               |
| ---------------------------------- | --------- | -------------------------------------------------- |
| Anonyme sans activité ni email lié | 90 jours  | supprimé, avec ses listes ; ses sessions survivent |
| Session `waiting` jamais lancée    | 7 jours   | supprimée                                          |
| Session `closed`                   | 180 jours | supprimée                                          |

Un compte reste **toujours** joignable donc **jamais** purgé dès qu'une adresse email lui est liée — même non confirmée —, ou un téléphone, ou une identité externe. Une session en cours protège aussi tous ses participants. Purger un compte n’efface jamais un classement : ses sessions restent, sans host et sans auteur (voir [Vie privée](#vie-privée)). Chaque passage journalise ses compteurs dans `public.maintenance_runs`. Détail et réglages dans [`docs/local-stack.md`](docs/local-stack.md#entretien).

## Déployer (Vercel + Supabase cloud)

1. Créer un projet Supabase, puis pousser le schéma : `supabase link --project-ref <ref>` et `supabase db push` (migrations, RLS, RPC, seed). Sans terminal sous la main, les mêmes opérations se pilotent depuis GitHub — voir [`docs/ci-database.md`](docs/ci-database.md).
2. Dans Supabase → Authentication → URL Configuration : ajouter `https://<domaine>/auth/confirm` aux _Redirect URLs_ (compte optionnel).
3. Dans Supabase → Database → Extensions : activer `pg_cron` si ce n'est pas déjà fait, puis rejouer la migration de purge — sans l'extension elle s'applique quand même, mais le job nocturne n'est pas planifié (vérifier avec `select jobname, schedule from cron.job`).
4. Dans Vercel → Settings → Environment Variables (Production **et** Preview) :

| Variable                               | Valeur                                                   |
| -------------------------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL du projet (Project Settings → API)                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé _publishable_ (l'ancienne _anon_ est acceptée aussi) |
| `NEXT_PUBLIC_SITE_URL`                 | optionnel — surcharge explicite (domaine personnalisé)   |

L'URL publique (`env.SITE_URL`, côté serveur) est résolue dans cet ordre : `NEXT_PUBLIC_SITE_URL` si définie et non locale, sinon les variables système Vercel — `VERCEL_PROJECT_PRODUCTION_URL` en production, `VERCEL_BRANCH_URL` / `VERCEL_URL` en preview — et enfin `http://localhost:3000` en développement. Un `localhost` copié par erreur dans les variables Vercel est ignoré.

Le build échoue volontairement si `NEXT_PUBLIC_SUPABASE_URL` ou la clé manque (`src/env.ts`) : mieux vaut un build rouge qu'une app déployée qui ne parle à aucune base.

## Roadmap

Les évolutions envisagées (import Google Places, filtres, anti-fatigue, notifications, PWA, i18n, RGPD…) sont suivies dans les [issues GitHub](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues).

Leur classement par priorité et leur version cible (v1.1 → v2.0) sont dans [`docs/roadmap.md`](docs/roadmap.md).

## Hors scope (v1)

- Réservation / intégration TheFork, OpenTable
- Commentaires ou avis
