# 🍴 onmangekoi

> Voter où manger avec ses collègues et amis, sans perdre 10 minutes à « je sais pas, comme tu veux ».

## Le principe

1. Tu choisis des restaurants — dans la base, dans une de tes **listes** de favoris, ou en ajoutant le tien à la volée
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

## Base de restaurants

| Source   | Origine                                              | Qui peut modifier |
| -------- | ---------------------------------------------------- | ----------------- |
| `seed`   | livrée avec le schéma                                | personne          |
| `manual` | ajoutée depuis l'app (nom, cuisine, adresse, budget) | son créateur      |
| `google` | importée depuis Google Places                        | son importateur   |

Le formulaire « Ajouter un resto » est disponible partout où l'on choisit des restaurants — session, liste, liste partagée — et le resto créé est sélectionné aussitôt, sans rechargement.

La déduplication est **souple** : un nom proche (recherche trigram) déclenche un avertissement et propose le resto existant en un clic, mais ne bloque jamais l'ajout — deux restos peuvent légitimement porter le même nom.

### Import Google Places

Quand `GOOGLE_PLACES_API_KEY` est configurée, un onglet **Google** apparaît à côté de la base : la même saisie cherche chez Google, un clic importe le resto et le sélectionne. Le bouton « Autour de moi » ajoute un biais géographique de 5 km, sur position explicitement autorisée.

| Garantie           | Comment                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Clé jamais exposée | La recherche passe par `POST /api/places/search`, côté serveur ; la variable n'est pas préfixée `NEXT_PUBLIC_`              |
| Zéro doublon       | `upsert_restaurant_from_place` est idempotente sur `place_id`, garantie par un index unique                                 |
| Données de source  | Le navigateur n'envoie qu'un `place_id` à l'import ; les champs enregistrés sont relus côté serveur, jamais reçus du client |
| Coût maîtrisé      | Réponses gardées 24 h en mémoire ; l'import se sert de ce cache avant de rappeler Google                                    |

Sans clé, l'onglet n'apparaît pas et le reste de l'app fonctionne à l'identique.

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
src/app/                 routes App Router (setup, login, join, sessions, lists, l/[slug], account, auth, api/places)
src/components/          ui/ (primitives) · layout/ · session/ · lists/ · account/ · restaurants/
src/data-access/         requêtes Supabase (un module par table) + places.ts (Google) + models/
src/use-cases/           logique métier composée (créer / rejoindre / onboarding)
src/lib/actions/         Server Actions (validation Zod, auth, erreurs typées)
src/lib/                 schémas, Crockford, slug, share/invite (parsing), site (URL absolues), qr, places, erreurs
src/hooks/               Realtime de session, debounce, `useCanShare`, `useIsClient`
supabase/migrations/     schéma, RLS, RPC (create/join/launch/submit_vote/close/results)
e2e/                     Playwright
```

## Sécurité

- **Aucune table n'est lisible en `using (true)`.** Les tokens et codes d'invitation ne se résolvent que via des fonctions `security definer` qui prennent le secret en argument et renvoient uniquement la ligne visée.
- **Toutes les écritures métier passent par des RPC** transactionnelles (`create_session`, `join_session`, `launch_session`, `submit_vote`, `close_session`) qui revérifient les règles côté base.
- Les votes individuels ne sont jamais exposés : `session_results` renvoie un agrégat.
- L'ajout d'un restaurant passe par `create_manual_restaurant`, qui pose elle-même `created_by` et `source` : impossible de se faire passer pour quelqu'un d'autre ni de se faire passer pour du seed. Les policies RLS portent la même règle pour toute écriture directe, et la modification reste réservée au créateur.
- La clé Google Places ne quitte jamais le serveur, et aucune policy RLS n'ouvre l'écriture en `source = 'google'` : `upsert_restaurant_from_place` est le seul chemin. Les corps d'erreur renvoyés par Google restent dans les logs serveur.
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
| `GOOGLE_PLACES_API_KEY`                | optionnel — active l'import Google (serveur uniquement)  |

L'URL publique (`env.SITE_URL`, côté serveur) est résolue dans cet ordre : `NEXT_PUBLIC_SITE_URL` si définie et non locale, sinon les variables système Vercel — `VERCEL_PROJECT_PRODUCTION_URL` en production, `VERCEL_BRANCH_URL` / `VERCEL_URL` en preview — et enfin `http://localhost:3000` en développement. Un `localhost` copié par erreur dans les variables Vercel est ignoré.

Le build échoue volontairement si `NEXT_PUBLIC_SUPABASE_URL` ou la clé manque (`src/env.ts`) : mieux vaut un build rouge qu'une app déployée qui ne parle à aucune base.

## Roadmap

Les évolutions envisagées (filtres, anti-fatigue, notifications, PWA, i18n, RGPD…) sont suivies dans les [issues GitHub](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues).

Leur classement par priorité et leur version cible (v1.1 → v2.0) sont dans [`docs/roadmap.md`](docs/roadmap.md).

## Hors scope (v1)

- Réservation / intégration TheFork, OpenTable
- Commentaires ou avis
