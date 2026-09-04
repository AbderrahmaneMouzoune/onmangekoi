# 🍴 onmangekoi

> Voter où manger avec ses collègues et amis, sans perdre 10 minutes à « je sais pas, comme tu veux ».

## Le principe

1. Tu choisis des restaurants — dans la base, ou dans une de tes **listes** de favoris
2. Tu lances une **session**, tu envoies le code ou le lien au groupe
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

## Stack

| Couche     | Choix                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| Frontend   | Next.js 16 (App Router, Turbopack, `proxy.ts`) · React 19 · TypeScript     |
| UI         | Tailwind CSS 4 · Base UI · Remix Icon · charte « L'ardoise »               |
| Données    | Supabase (PostgreSQL 17, RLS, RPC `security definer`)                      |
| Temps réel | Supabase Realtime (Postgres Changes, resync au retour au premier plan)     |
| Auth       | Utilisateur anonyme créé au choix du pseudo · email/mot de passe optionnel |
| Validation | Zod 4 · `@t3-oss/env-nextjs`                                               |
| Tests      | Vitest 5 + Testing Library · Playwright                                    |
| Qualité    | ESLint 9 (flat) · Prettier · Husky · commitlint · CI GitHub Actions        |

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
proxy.ts                 rafraîchit la session, protège les routes (redirige vers /setup?next=…)
src/app/                 routes App Router (setup, login, join, sessions, lists, l, account, auth)
src/components/          ui/ (primitives) · layout/ · session/ · lists/ · account/ · restaurants/
src/data-access/         requêtes Supabase, un module par table + models/ (types générés)
src/use-cases/           logique métier composée (créer / rejoindre / onboarding)
src/lib/actions/         Server Actions (validation Zod, auth, erreurs typées)
src/lib/                 schémas, routage sûr, normalisation d'invitation, erreurs, format
src/hooks/               Realtime de session, debounce, `useCanShare`, `useIsClient`
supabase/migrations/     schéma, RLS, RPC (create/join/launch/submit_vote/close/results)
e2e/                     Playwright
```

## Sécurité

- **Aucune table n'est lisible en `using (true)`.** Les tokens et codes d'invitation ne se résolvent que via des fonctions `security definer` qui prennent le secret en argument et renvoient uniquement la ligne visée.
- **Toutes les écritures métier passent par des RPC** transactionnelles (`create_session`, `join_session`, `launch_session`, `submit_vote`, `close_session`) qui revérifient les règles côté base.
- Les votes individuels ne sont jamais exposés : `session_results` renvoie un agrégat.
- Les codes d'invitation font 6 caractères sur un alphabet de 32 symboles sans ambiguïté (≈ 1 milliard de combinaisons), générés avec reprise sur collision.
- Aucun utilisateur Supabase n'est créé sur une simple visite : uniquement au choix du pseudo.
- Les messages d'erreur Postgres ne remontent jamais tels quels : seuls les codes métier `omk:*` sont traduits.

## Déployer (Vercel + Supabase cloud)

1. Créer un projet Supabase, puis pousser le schéma : `supabase link --project-ref <ref>` et `supabase db push` (migrations, RLS, RPC, seed).
2. Dans Supabase → Authentication → URL Configuration : ajouter `https://<domaine>/auth/confirm` aux _Redirect URLs_ (compte optionnel).
3. Dans Vercel → Settings → Environment Variables (Production **et** Preview) :

| Variable                               | Valeur                                                     |
| -------------------------------------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL du projet (Project Settings → API)                     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé _publishable_ (l'ancienne _anon_ est acceptée aussi)   |
| `NEXT_PUBLIC_SITE_URL`                 | optionnel — à défaut, l'URL de production Vercel est prise |

Le build échoue volontairement si `NEXT_PUBLIC_SUPABASE_URL` ou la clé manque (`src/env.ts`) : mieux vaut un build rouge qu'une app déployée qui ne parle à aucune base.

## Hors scope (v1)

- Réservation / intégration TheFork, OpenTable
- Anti-fatigue (détection des restaurants récurrents)
- Notifications push
- Commentaires ou avis
- Filtres (régime, distance, budget)
- Import Google Places (roadmap)
