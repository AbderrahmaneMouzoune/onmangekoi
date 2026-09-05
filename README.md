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

## URLs, codes et liens de partage

Aucune URL n'expose d'identifiant technique : chaque ressource s'adresse par **son code court**, celui qu'on se dit à voix haute.

| Route                    | Exemple                    | Qui la voit                   |
| ------------------------ | -------------------------- | ----------------------------- |
| Salle de session         | `/sessions/7K3M9P`         | participants                  |
| Classement               | `/sessions/7K3M9P/results` | participants                  |
| Invitation (lien + QR)   | `/join/7K3M9P`             | qui reçoit le lien ou le code |
| Liste, côté propriétaire | `/lists/H4V2Q8ZX0M`        | propriétaire                  |
| Liste partagée           | `/l/H4V2Q8ZX0M`            | qui reçoit le lien            |

| Objet   | Code          | Forme         |
| ------- | ------------- | ------------- |
| Session | 6 caractères  | `7K3 M9P`     |
| Liste   | 10 caractères | `H4V2Q-8ZX0M` |

Les codes utilisent l'alphabet **Crockford base32** (`0-9`, `A-Z` sans `I`, `L`, `O`, `U`) : pas de lettre ambiguë à l'oral ni à l'écrit. La saisie est tolérante — minuscules, espaces, tirets, `I`/`L` lus comme `1`, `O` comme `0` — et un lien collé entier est accepté.

Chaque page redirige vers sa forme canonique : un code tapé en minuscules ou avec des tirets, comme un ancien lien (uuid de session ou de liste, jeton hexadécimal de partage, `/l/<slug>-<CODE>`), retombe sur l'URL du moment. Rien de ce qui a déjà été partagé ne casse.

Le code d'invitation peut aussi être **scanné** : la page « Rejoindre » ouvre la caméra (`BarcodeDetector` natif, repli `jsqr`) et lit le QR affiché par le host.

## Stack

| Couche     | Choix                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| Frontend   | Next.js 16 (App Router, Turbopack, `proxy.ts`) · React 19 · TypeScript     |
| Routage    | `src/config/router.config.ts` — toutes les URL construites au même endroit |
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
src/proxy.ts             rafraîchit la session, protège les routes (redirige vers /setup?next=…)
src/config/              router.config.ts : préfixes protégés, longueurs de codes, `router.*()`
src/app/                 routes App Router (setup, login, join/[code], sessions/[code], lists/[code], l/[code], account, auth)
src/components/          ui/ (primitives) · layout/ · session/ · lists/ · account/ · restaurants/
src/data-access/         requêtes Supabase, un module par table + models/ (types générés)
src/use-cases/           logique métier composée (créer / rejoindre / onboarding)
src/lib/actions/         Server Actions (validation Zod, auth, erreurs typées)
src/lib/                 schémas, Crockford (`codeFromSegment`), share/invite (parsing), site (URL absolues), qr, erreurs
src/hooks/               Realtime de session, debounce, `useCanShare`, `useIsClient`
supabase/migrations/     schéma, RLS, RPC (create/join/launch/submit_vote/close/results)
e2e/                     Playwright
```

## Sécurité

- **Aucune table n'est lisible en `using (true)`.** Les tokens et codes d'invitation ne se résolvent que via des fonctions `security definer` qui prennent le secret en argument et renvoient uniquement la ligne visée. Les codes qui figurent dans les URL privées (`/sessions/…`, `/lists/…`) ne contournent rien : la RLS filtre la lecture comme pour un id.
- **Aperçu d'invitation** (`session_preview`) : un visiteur non authentifié — typiquement le robot qui déplie le lien dans une conversation — n'obtient un aperçu par code court que sur une session **en attente**, et seulement le nom, le pseudo du host et deux compteurs. Rejoindre exige toujours un compte.
- **Toutes les écritures métier passent par des RPC** transactionnelles (`create_session`, `join_session`, `launch_session`, `submit_vote`, `close_session`) qui revérifient les règles côté base.
- Les votes individuels ne sont jamais exposés : `session_results` renvoie un agrégat.
- Les codes d'invitation font 6 caractères et les codes de partage de liste 10, sur l'alphabet Crockford base32 (32 symboles, ≈ 1 milliard et ≈ 10¹⁵ combinaisons), tirés uniformément avec `gen_random_bytes` et reprise sur collision.
- Les pages sont rendues avec des chargements parallèles (`Promise.all`) et les lectures par requête sont dédupliquées via `React.cache` (`getCurrentUser`, `getProfile`, `getSessionById`…).
- Aucun utilisateur Supabase n'est créé sur une simple visite : uniquement au choix du pseudo.
- Les messages d'erreur Postgres ne remontent jamais tels quels : seuls les codes métier `omk:*` sont traduits.

## Déployer (Vercel + Supabase cloud)

1. Créer un projet Supabase, puis pousser le schéma : `supabase link --project-ref <ref>` et `supabase db push` (migrations, RLS, RPC, seed).
2. Dans Supabase → Authentication → URL Configuration : ajouter `https://<domaine>/auth/confirm` aux _Redirect URLs_ (compte optionnel).
3. Dans Vercel → Settings → Environment Variables (Production **et** Preview) :

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
