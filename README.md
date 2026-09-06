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

## Fiche restaurant

Chaque restaurant peut porter une photo, une adresse, un site, des coordonnées et des horaires. Tout est optionnel : sans la donnée, le bloc concerné disparaît au lieu de s'afficher vide.

| Colonne          | Forme                                                                                 | Usage                                            |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `photo_url`      | HTTPS, hôte autorisé                                                                  | fond de la carte de vote, vignette du classement |
| `address`/`city` | texte                                                                                 | ligne d'adresse, repli du lien d'itinéraire      |
| `website`        | HTTP(S)                                                                               | bouton « Le site » sur le gagnant                |
| `location`       | `{"lat": number, "lng": number}`                                                      | lien d'itinéraire et mini-carte du gagnant       |
| `opening_hours`  | `{"timezone"?: string, "periods": [{"day": 0-6, "open": "HH:MM", "close": "HH:MM"}]}` | badge « ouvert / fermé » sur la carte de vote    |

`day` suit `Date#getDay` (0 = dimanche) ; une période dont la fermeture précède l'ouverture passe minuit (`22:00 → 02:00`), y compris par-dessus la fin de semaine. Le fuseau est celui du restaurant quand il est connu, celui du visiteur sinon. Les formes `jsonb` sont validées en base (`is_geo_point`, `is_opening_hours`) **et** à la lecture : une donnée importée reste une donnée externe.

Les images distantes ne sont chargées que depuis les hôtes de `ALLOWED_IMAGE_HOSTS` (`src/lib/images.ts`), synchronisés avec `images.remotePatterns` de `next.config.mjs` — un test échoue si les deux listes divergent. Une URL hors liste n'est pas rendue plutôt que de faire échouer `next/image`. La carte visible du deck charge sa photo en `priority`, celle du dessous en `lazy`.

La mini-carte du gagnant est un bloc de 2×2 tuiles [OpenStreetMap](https://www.openstreetmap.org/copyright) et un repère positionné en pourcentage : pas de clé d'API, pas de JavaScript de cartographie. L'attribution ODbL est affichée sous la carte.

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
| Coût maîtrisé      | Réponses gardées 24 h en mémoire, et deux masques de champs distincts (voir ci-dessous)                                     |

L'import remplit la fiche décrite plus haut : `photo_url`, `website`, `location`, `opening_hours` et `description`. Un lieu réimporté rafraîchit ces champs sans jamais en effacer un déjà connu — ce qui fait aussi office d'entretien, l'adresse d'une photo Google n'étant pas éternelle.

Le fuseau des horaires n'est pas demandé à Google : `opening_hours.timezone` reste absent et l'app raisonne dans celui du visiteur.

**Deux masques de champs, deux factures.** Google facture au champ le plus cher demandé, et une recherche ramène dix résultats : elle ne demande donc que de quoi afficher une liste. Photo, site, horaires et résumé ne sont demandés que sur le détail d'un lieu — une fois, au clic sur « importer ». La photo coûte un appel de plus, pour convertir son nom de ressource en adresse servable : celle de l'endpoint media exigerait la clé pour être chargée, on stocke donc le `photoUri` qu'il renvoie, servi par Google sans clé et sur un hôte de `ALLOWED_IMAGE_HOSTS`.

**Quand la recherche échoue.** Le message affiché nomme la famille de panne plutôt que de renvoyer tout le monde vers un « réessaie » indifférencié, et le log serveur (`places: recherche → <statut> <raison>`) donne la raison exacte renvoyée par Google — `PERMISSION_DENIED`, `SERVICE_DISABLED`, `RESOURCE_EXHAUSTED`…

| Message affiché                            | Statut Google  | Où regarder                                                                                                                                                                                           |
| ------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Google refuse la clé de ce déploiement » | 401 / 403      | Clé absente ou invalide ; **restriction par référent HTTP** alors que l'appel part du serveur (restreindre par API, pas par site) ; « Places API (New) » pas activée ; facturation non liée au projet |
| « Trop de recherches Google d'un coup »    | 429            | Quota par minute atteint dans Google Cloud                                                                                                                                                            |
| « Google n'a pas répondu à temps »         | aucune réponse | Rien reçu en 8 s : réseau ou lenteur passagère                                                                                                                                                        |
| « La recherche Google a échoué »           | 5xx            | Incident côté Google, passager                                                                                                                                                                        |

L'ancienne « Places API » ne suffit pas : c'est **Places API (New)** qu'il faut activer, les deux se ressemblant beaucoup dans la console.

Sans clé, l'onglet n'apparaît pas et le reste de l'app fonctionne à l'identique.

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
| Mesure     | PostHog (EU), après consentement — désactivée sans clé                                   |
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
src/app/                 routes App Router (setup, login, join/[code], sessions/[code], lists/[code], l/[code], account, legal, auth, api/places)
src/components/          ui/ (primitives) · layout/ · home/ · session/ · lists/ · account/ · restaurants/ · onboarding/
src/data-access/         requêtes Supabase, un module par table + places.ts (Google) + models/ (types générés)
src/use-cases/           logique métier composée (créer / rejoindre / voter / importer / onboarding)
src/domain/              règles et vocabulaire métier : votes, codes de partage, erreurs, horaires, places, schemas/ (Zod)
src/actions/             Server Actions (validation Zod, auth, revalidate/redirect)
src/lib/                 utilitaires transverses : Crockford (`codeFromSegment`), format, routing, site (URL absolues), qr,
                         images (hôtes autorisés), maps (itinéraire, tuiles), ttl-cache
src/lib/analytics/       consentement, masquage des URL, catalogue d'événements, chargement de PostHog
src/hooks/               Realtime de session, debounce, `useCanShare`, `useIsClient`, `useOpenNow`
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
- **Rien qui écrit n'est prérendu.** `/join/[code]` inscrit la personne dans la session avant de rediriger : la coquille n'affiche que « on te fait entrer… », le reste est fait à la requête.

Le catalogue étant partagé, la recherche du sélecteur de restaurants sort du cache elle aussi : une même requête ne touche la base qu'une fois par heure, pour tout le monde. Après un import de restaurants, `revalidateTag(RESTAURANTS_CACHE_TAG)` suffit à le rafraîchir.

## Sécurité

- **Aucune table n'est lisible en `using (true)`.** Les tokens et codes d'invitation ne se résolvent que via des fonctions `security definer` qui prennent le secret en argument et renvoient uniquement la ligne visée. Les codes qui figurent dans les URL privées (`/sessions/…`, `/lists/…`) ne contournent rien : la RLS filtre la lecture comme pour un id.
- **Aperçu d'invitation** (`session_preview`) : un visiteur non authentifié — typiquement le robot qui déplie le lien dans une conversation — n'obtient un aperçu par code court que sur une session **en attente**, et seulement le nom, le pseudo du host et deux compteurs. Rejoindre exige toujours un compte.
- **Toutes les écritures métier passent par des RPC** transactionnelles (`create_session`, `join_session`, `launch_session`, `submit_vote`, `close_session`) qui revérifient les règles côté base.
- Les votes individuels ne sont jamais exposés : `session_results` renvoie un agrégat.
- L'ajout d'un restaurant passe par `create_manual_restaurant`, qui pose elle-même `created_by` et `source` : impossible de se faire passer pour quelqu'un d'autre ni de se faire passer pour du seed. Les policies RLS portent la même règle pour toute écriture directe, et la modification reste réservée au créateur.
- La clé Google Places ne quitte jamais le serveur, et aucune policy RLS n'ouvre l'écriture en `source = 'google'` : `upsert_restaurant_from_place` est le seul chemin. Les corps d'erreur renvoyés par Google restent dans les logs serveur.
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
| `GOOGLE_PLACES_API_KEY`                | optionnel — active l'import Google (serveur uniquement)  |
| `NEXT_PUBLIC_POSTHOG_KEY`              | optionnel — sans elle, aucune mesure n'est chargée       |
| `NEXT_PUBLIC_POSTHOG_HOST`             | optionnel — `https://eu.i.posthog.com` par défaut        |

L'URL publique (`env.SITE_URL`, côté serveur) est résolue dans cet ordre : `NEXT_PUBLIC_SITE_URL` si définie et non locale, sinon les variables système Vercel — `VERCEL_PROJECT_PRODUCTION_URL` en production, `VERCEL_BRANCH_URL` / `VERCEL_URL` en preview — et enfin `http://localhost:3000` en développement. Un `localhost` copié par erreur dans les variables Vercel est ignoré.

Le build échoue volontairement si `NEXT_PUBLIC_SUPABASE_URL` ou la clé manque (`src/env.ts`) : mieux vaut un build rouge qu'une app déployée qui ne parle à aucune base.

## Vie privée et mesure d'audience

- La mesure est **doublement conditionnée** : sans `NEXT_PUBLIC_POSTHOG_KEY`, le module est inerte ; sans consentement explicite, le script PostHog n'est même pas téléchargé — donc aucun cookie, aucun identifiant, aucune requête.
- Le bandeau propose « Refuser » et « Accepter » au même niveau, et le choix se révise depuis **Mon compte**.
- **Aucune donnée personnelle ne sort** : ni pseudo, ni email, ni nom de liste ou de restaurant. Les URL sont masquées avant envoi (`/sessions/[code]`, `/join/[code]`, `/l/[code]`), car le code qu'elles portent suffirait à rejoindre une session ou à lire une liste. Le seul identifiant transmis est l'UUID opaque du profil.
- Le détail — catalogue d'événements, masquage, entonnoirs à construire — est dans [`docs/analytics.md`](docs/analytics.md).

## Roadmap

Les évolutions envisagées (filtres, anti-fatigue, notifications, PWA, i18n, RGPD…) sont suivies dans les [issues GitHub](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues).

Leur classement par priorité et leur version cible (v1.1 → v2.0) sont dans [`docs/roadmap.md`](docs/roadmap.md).

## Hors scope (v1)

- Réservation / intégration TheFork, OpenTable
- Commentaires ou avis
