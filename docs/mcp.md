# Assistants IA (MCP)

onmangekoi expose un **serveur MCP distant** : Claude, ChatGPT, Claude Code, Cursor ou n'importe quel client compatible peut chercher des restos, tenir les listes, lancer une session ou lire un classement au nom de l'utilisateur — avec exactement les droits qu'il a dans l'app, pas un de plus.

> « J'ai mangé à La Ba, c'était bon. »

L'IA cherche le resto dans le catalogue de l'app ; s'il n'y est pas, elle le cherche chez Google et l'importe ; puis elle le range dans la bonne liste — jamais deux fois.

Un seul serveur, **deux façons de s'y connecter** :

| Connexion                   | Pour qui                                         | Ce qu'elle ouvre                                     |
| --------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| **OAuth** (recommandée)     | Claude, ChatGPT, Claude Code, Cursor, Inspector… | tous les tools                                       |
| **Jeton personnel** `omk_…` | les clients qui ne savent pas faire OAuth        | catalogue et listes seulement (voir [Tools](#tools)) |

| Quoi                          | Où                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Serveur MCP (Streamable HTTP) | `https://<domaine>/api/mcp`                                                  |
| Résumé pour les agents        | `https://<domaine>/llms.txt` (convention [llmstxt.org](https://llmstxt.org)) |
| Serveur d'autorisation        | Supabase Auth, en mode serveur OAuth 2.1                                     |
| Page de consentement          | `https://<domaine>/oauth/consent`                                            |
| Jetons personnels             | **Mon compte › Assistants IA › jeton personnel**                             |

## Architecture

```
client MCP (Claude, ChatGPT, Cursor…)
   │  POST /api/mcp
   │    Authorization: Bearer <jeton OAuth Supabase>          (OAuth)
   │    Authorization: Bearer omk_…   ou   /api/mcp?key=omk_… (jeton personnel)
   ▼
src/app/api/mcp/route.ts
   │  withKeyParamAsBearer : ?key=omk_… recopié en en-tête (un en-tête présent l'emporte)
   │  withMcpAuth(…, verifyMcpToken)          ── pas de jeton / jeton invalide → 401
   │     ├─ forme omk_ + 48 hex → appelant { mode: 'token' }   (validité vérifiée en base)
   │     └─ sinon supabase.auth.getClaims(jeton) → { mode: 'oauth', userId, clientId }
   │        signature (JWKS), expiration, émetteur, rôle authenticated, client_id
   ▼
src/lib/mcp/server.ts   createMcpHandler — un McpServer neuf par requête, sans état
   │  tools/catalog.ts · lists.ts · sessions.ts · me.ts …  + 2 prompts
   ▼
src/lib/mcp/context.ts
   ├─ runSharedTool (catalogue, listes) ──────────────► src/data-access/mcp.ts → RPC mcp_*
   │     OAuth : client de l'utilisateur, p_token = null      mcp_act_as(p_token) :
   │     jeton : client public (anon), p_token = omk_…          null → auth.uid()
   │                                                           omk_… → empreinte SHA-256
   │                                                           → claims du propriétaire
   └─ runTool (sessions, votes, historique, profil) — OAuth seulement, sinon requires_oauth
         client Supabase portant le jeton de l'utilisateur (createCallerClient)
   ▼
PostgREST → RLS et RPC (`auth.uid()` = l'utilisateur), comme pour une session web
```

**En OAuth**, le jeton est un jeton Supabase ordinaire (`sub` = id de l'utilisateur, rôle `authenticated`, plus un claim `client_id`). Il est relayé tel quel à PostgREST, donc la RLS et les RPC `security definer` s'appliquent sans aucune règle propre au MCP. Les tools réutilisent `src/data-access`, `src/use-cases` et `src/domain` ; ils ne lisent jamais les cookies (`createServerClient`, `getCurrentUser`) — l'appelant est `caller.userId`, tiré du jeton.

**Avec un jeton personnel**, le serveur n'a ni cookie ni JWT : la production signe ses JWT en ES256 avec une clé que l'app ne détient pas, il ne peut donc pas en fabriquer un. Chaque tool partagé appelle une RPC `mcp_*` (clé publishable, rôle `anon`) avec le jeton en premier argument ; `mcp_act_as` le résout par son empreinte, pose les claims du propriétaire pour la seule transaction, et chaque RPC revérifie que la liste visée lui appartient. Les mêmes RPC servent l'OAuth, avec `p_token` nul : `mcp_act_as` rend alors `auth.uid()`. Un seul chemin pour le catalogue et les listes, quel que soit le mode.

Les tools reproduisent les revalidations des Server Actions équivalentes (`revalidateTag`, `revalidateLocalizedPath`), jamais `updateTag` (qui lève une erreur dans un route handler) ni `redirect`. Les notifications push partent d'un trigger en base : lancer ou clôturer une session depuis un assistant prévient le groupe comme depuis l'app.

La liste à jour des tools est aussi dans [`/llms.txt`](../src/app/llms.txt/content.ts) ; un test vérifie que tout tool enregistré y figure, avec la bonne connexion.

## Tools

Noms et descriptions en anglais, la langue que les modèles lisent le mieux ; les consignes du serveur demandent de répondre dans celle de la personne.

### Ouverts aux deux connexions

| Tool                              | Ce qu'il fait                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `remember_restaurant`             | Le raccourci « j'ai mangé à… » : cherche, importe si besoin, range. Rend un statut (voir plus bas)  |
| `find_restaurant`                 | Recherche floue dans le catalogue (« la ba » trouve « La Ba » et « La Baraka »), avec `in_my_lists` |
| `search_restaurants`              | Recherche dans le catalogue (nom, prix, tags, distance)                                             |
| `search_google_places`            | Recherche Google — seulement si `GOOGLE_PLACES_API_KEY` est configurée                              |
| `add_restaurant`                  | Ajoute au catalogue, depuis Google (`googlePlaceId`) ou à la main ; ne range pas dans une liste     |
| `my_lists`, `get_list`            | Lire ses listes, avec leur lien de partage (`shareUrl`)                                             |
| `create_list`                     | Créer une liste                                                                                     |
| `add_to_list`, `remove_from_list` | Ranger ou retirer un resto — idempotents                                                            |
| `get_public_results`              | Lire un classement que l'hôte a rendu public (podium seul, sans pseudos)                            |
| `whoami`                          | Le pseudo au nom duquel agit la connexion, et son mode (`oauth` ou `token`)                         |

### Réservés à OAuth

Un jeton personnel reçoit `requires_oauth`, avec la consigne de proposer la connexion OAuth.

| Tool                                                        | Ce qu'il fait                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `suggest_restaurants`                                       | Une sélection tirée de l'historique, sans les gagnants récents      |
| `get_shared_list`                                           | Lire une liste partagée par quelqu'un d'autre (lien ou code)        |
| `my_sessions`, `my_stats`                                   | Historique des sessions, statistiques personnelles                  |
| `get_food_constraints`, `set_food_constraints`              | Régimes et budget                                                   |
| `create_session`, `start_session_from_list`                 | Créer une session (restos choisis ou une liste) ; rend l'invitation |
| `get_session`, `join_session`, `add_restaurants_to_session` | Lire, rejoindre, compléter une session                              |
| `vote`, `launch_session`, `close_session`                   | **Irréversibles**, à faire confirmer                                |
| `get_results`                                               | Classement d'une session close                                      |
| `confirm_decision`, `set_results_public`                    | Engagent le groupe, à faire confirmer                               |

### Prompts

Deux prompts sont proposés (`/jai-mange`, `/partager-une-liste`), et le serveur envoie des **instructions** au client à l'initialisation : chercher avant de créer, ne jamais inventer d'id, faire confirmer tout geste qui engage le groupe, répondre dans la langue de la personne.

### Statuts de `remember_restaurant`

| Statut            | Quand                                                                         | L'IA…                                                 |
| ----------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| `added`           | Le resto est rangé                                                            | confirme, donne le lien de la liste                   |
| `already_in_list` | Il y était déjà (dans la liste visée, ou dans une liste où il est déjà rangé) | le dit                                                |
| `ambiguous`       | Plusieurs homonymes, ou seulement des noms voisins (catalogue et/ou Google)   | demande lequel, puis `add_to_list` / `add_restaurant` |
| `choose_list`     | Plusieurs listes et aucune désignée                                           | demande laquelle, rappelle avec `list` ou `listName`  |
| `not_found`       | Rien nulle part                                                               | demande la ville, ou propose un ajout manuel          |

Un nom « identique » s'entend à la casse, aux accents et aux articles près (`la ba` = `Restaurant La Ba`, ≠ `La Baraka`) — voir `src/domain/restaurant-match.ts`. Dans le doute, l'outil n'agit pas : la liste se choisit **avant** tout import, pour qu'une question posée à la personne ne laisse rien derrière elle.

## Découverte (OAuth)

Le parcours que suit un client MCP au premier branchement :

1. Il appelle `/api/mcp` sans jeton et reçoit un **401** dont l'en-tête `WWW-Authenticate` pointe vers les métadonnées de ressource protégée.
2. Il lit ces métadonnées (**RFC 9728**), servies à deux chemins — la forme suffixée par le chemin du serveur, que les clients essaient d'abord, et la forme racine :
   - `/.well-known/oauth-protected-resource/api/mcp`
   - `/.well-known/oauth-protected-resource`

   Elles désignent la ressource (`https://<domaine>/api/mcp`, l'URL exacte saisie par l'utilisateur) et le serveur d'autorisation (`https://<ref>.supabase.co/auth/v1`).

3. Il lit les métadonnées du serveur d'autorisation (**RFC 8414**), publiées par Supabase : `https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`. On y trouve les endpoints d'autorisation, de jeton et d'enregistrement.
4. Il s'enregistre (**DCR**, RFC 7591), envoie l'utilisateur sur l'autorisation Supabase, qui le redirige vers `/oauth/consent` ; l'utilisateur se connecte si besoin et approuve.
5. Il échange le code (PKCE) contre un jeton d'accès et un jeton de rafraîchissement, puis rappelle `/api/mcp`.

Les routes `.well-known` vivent hors du proxy (son matcher les exclut), tout comme `/api/` et `/llms.txt`.

Un jeton personnel saute toute cette découverte : présent dès la première requête, il n'obtient pas de 401 tant qu'il a la forme `omk_` + 48 caractères hexadécimaux — un jeton bien formé mais inventé ou révoqué n'est refusé qu'à l'appel d'un tool, par la base (`invalid_api_token`). Un jeton mal recopié, lui, reçoit le 401 et relance le parcours OAuth.

## Activer OAuth en production

À faire une fois dans le dashboard Supabase, et à vérifier avant d'annoncer le serveur :

1. **Authentication › OAuth Server** : activer le serveur OAuth.
2. **Authorization Path** : `/oauth/consent`. Le chemin est relatif à la **Site URL**.
3. **Authentication › URL Configuration › Site URL** : le domaine de production (`https://<domaine>`), sans quoi le consentement part vers une mauvaise origine.
4. **Dynamic client registration** : activée. Les clients MCP ne connaissent pas onmangekoi à l'avance et s'enregistrent eux-mêmes.
5. **Project Settings › JWT Keys** : des **clés de signature asymétriques** (ES256) doivent être actives. Avec l'ancienne clé partagée HS256, `getClaims` ne peut pas vérifier localement et retombe sur `/auth/v1/user`, que Supabase Auth refuse aux jetons OAuth : tout appel MCP finirait en 401.

Les jetons personnels, eux, ne demandent aucune configuration : ils reposent sur la migration `20261105120000_ai_access_mcp.sql`. `search_google_places` et l'import Google de `remember_restaurant` n'apparaissent que si `GOOGLE_PLACES_API_KEY` est configurée.

Côté Vercel, rien à ajouter : le serveur ne lit que `NEXT_PUBLIC_SUPABASE_URL`, la clé publishable et l'URL publique déjà configurées (voir [Déployer](../README.md#déployer-vercel--supabase-cloud)).

## En local

`supabase/config.toml` active déjà le serveur OAuth :

```toml
[auth.oauth_server]
enabled = true
authorization_url_path = "/oauth/consent"
allow_dynamic_registration = true
```

Reste les clés asymétriques, qui ne se commitent pas :

```bash
# la commande imprime une seule JWK ; le fichier attend un tableau de clés
echo "[$(supabase gen signing-key --algorithm ES256 2>/dev/null)]" > supabase/signing_keys.json
# puis, dans supabase/config.toml, décommenter :
#   signing_keys_path = "./signing_keys.json"
supabase stop && supabase start
```

> `supabase/signing_keys.json` contient une **clé privée** : il ne doit jamais être commité. Vérifier avec `git check-ignore supabase/signing_keys.json` qu'il est ignoré avant le premier `git add` (sinon, l'ajouter à `supabase/.gitignore`).

Le serveur répond alors sur `http://localhost:3000/api/mcp`, et le consentement sur `http://localhost:3000/oauth/consent` (`site_url` du `config.toml`). Changer de clés invalide les sessions en cours : il faut se reconnecter dans l'app.

## Connecter un assistant

### En OAuth (recommandé)

Partout, l'URL à saisir est celle du serveur, chemin compris, **sans clé** : `https://<domaine>/api/mcp`. La première utilisation ouvre le navigateur sur onmangekoi pour se connecter et approuver l'assistant. La page compte affiche cette adresse prête à copier, et la liste des apps connectées, chacune déconnectable.

#### Claude (web et desktop)

**Settings › Connectors › Add custom connector**, nom `onmangekoi`, URL `https://<domaine>/api/mcp`, puis **Connect**. Aucun client ID à fournir : Claude s'enregistre seul.

#### ChatGPT

Activer le **developer mode** (**Settings › Apps & Connectors › Advanced settings**), puis **Create** un connecteur : URL `https://<domaine>/api/mcp`, authentification **OAuth**. ChatGPT s'enregistre seul lui aussi.

#### Claude Code

```bash
claude mcp add --transport http onmangekoi https://<domaine>/api/mcp
```

Puis `/mcp` dans Claude Code pour lancer l'authentification.

#### Cursor

Dans `~/.cursor/mcp.json` (ou `.cursor/mcp.json` du projet) :

```json
{
  "mcpServers": {
    "onmangekoi": { "url": "https://<domaine>/api/mcp" }
  }
}
```

Cursor propose ensuite de se connecter depuis **Settings › MCP**.

#### MCP Inspector (déboguer)

```bash
npx @modelcontextprotocol/inspector
```

Choisir le transport **Streamable HTTP**, l'URL `http://localhost:3000/api/mcp` (ou celle de prod), puis **Open Auth Settings › Quick OAuth Flow** : l'Inspector rejoue toute la découverte pas à pas (401, métadonnées, DCR, consentement, jeton), ce qui permet de voir où un client échoue. Ensuite **Connect**, **List Tools**, et chaque tool s'appelle à la main.

### Avec un jeton personnel (repli)

Pour un client qui ne sait pas faire OAuth. Il ne couvre que le catalogue et les listes.

1. Dans l'app : **Mon compte › Assistants IA › Pour les clients sans OAuth : jeton personnel › Créer un jeton**. Le jeton (`omk_…`) ne s'affiche qu'une fois.
2. Le coller dans son client, au choix :

| Client                           | Comment                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Client qui n'accepte qu'une URL  | `https://<domaine>/api/mcp?key=omk_…`                                                                         |
| Claude Code                      | `claude mcp add --transport http onmangekoi https://<domaine>/api/mcp --header "Authorization: Bearer omk_…"` |
| Cursor, Claude Desktop, VS Code… | bloc `mcpServers` avec `url` et l'en-tête `Authorization: Bearer omk_…`                                       |

La page compte génère les trois, prêts à copier. Un jeton se révoque d'un clic ; **dix au plus** par personne (`omk:too_many_api_tokens`).

## Sécurité

### Jetons personnels

- **Le jeton n'est jamais stocké** : seule son empreinte SHA-256 l'est (`api_tokens.token_hash`, illisible même par sa propriétaire, qui n'en voit que le nom et les 4 derniers caractères). 192 bits d'aléa : pas de force brute.
- **L'autorisation se fait en base**, par `mcp_act_as` (voir [Architecture](#architecture)) ; `last_used_at` est mis à jour au plus une fois par minute.
- **Révocation immédiate** : supprimer le jeton depuis la page compte coupe l'accès dès l'appel suivant, sans délai d'expiration.
- **`?key=` et ses risques** : le jeton voyage dans l'URL, donc dans les journaux d'accès (hébergeur, proxys) et l'historique du client. C'est le prix des clients qui ne savent pas envoyer d'en-tête. Préférer l'en-tête quand le client le permet, ou mieux, OAuth ; révoquer au moindre doute. Un jeton OAuth, lui, n'est jamais lu dans l'URL.
- **Pas de jeton fabriqué par une IA** : `create_api_token` refuse un JWT porteur d'un `client_id` (`omk:forbidden_for_connected_apps`) — un jeton personnel survivrait à la révocation de l'app connectée.
- Les ajouts de restos réutilisent `create_manual_restaurant` et `upsert_restaurant_from_place` : mêmes validations que l'app. Un import Google ne prend que l'identifiant du lieu ; la fiche est relue chez Google côté serveur.
- Le jeton part avec le compte (`on delete cascade`) et figure dans l'export RGPD (nom, 4 derniers caractères, dates — jamais l'empreinte).

### OAuth et commun aux deux modes

- **Pas de scopes métier.** Le serveur OAuth de Supabase ne propose pas de scopes personnalisés (seulement `openid`, `email`, `profile`, `phone`) : un assistant autorisé a les droits de l'utilisateur dans l'app, bornés par la RLS. D'où les deux points suivants.
- **Audience non vérifiable.** Le jeton porte `aud: authenticated`, pas l'URL de la ressource (Supabase n'applique pas l'indicateur de ressource RFC 8707). `verifyMcpToken` compense en exigeant l'émetteur du projet, le rôle `authenticated` et la présence de `client_id` : un jeton de session web volé dans un cookie n'ouvre pas le MCP.
- **Données minimisées.** Les sorties ne contiennent ni email, ni `host_id`, ni jeton d'invitation, ni uuid des autres participants — au plus leur pseudo — ni le code du classement public tant que le host ne l'a pas ouvert. Les lectures publiques (RPC `public_results`, `public_list`) restent aussi pauvres que dans l'app.
- **Actions irréversibles sous confirmation.** `vote`, `launch_session`, `close_session`, `confirm_decision` et `set_results_public` sont annotés `destructiveHint` : les clients qui en tiennent compte demandent une confirmation, et les consignes du serveur (`MCP_INSTRUCTIONS`) exigent de demander à l'utilisateur avant chaque geste qui engage le groupe. Les noms saisis par d'autres (restos, listes, sessions, pseudos) sont signalés au modèle comme des données, jamais des instructions.
- **Le compte reste à la personne.** Supprimer son compte (`delete_my_account`) et exporter ses données (`export_my_data`) sont refusés à tout jeton qui porte un `client_id`, et hors de portée d'un jeton personnel, qui n'atteint que les RPC `mcp_*` (`omk:forbidden_for_connected_apps`, migration `20261105130000_oauth_clients_cannot_touch_account.sql`, scénario `supabase/tests/oauth-connected-apps.test.sql`). Ces deux RPC sont des enveloppes autour de `*_unguarded` : une future modification se fait dans la fonction interne, jamais par `create or replace` sur l'enveloppe. Les endpoints de Supabase Auth (`/user` : changer d'email ou de mot de passe) refusent eux-mêmes les jetons OAuth depuis début novembre 2026 — à revérifier sur le projet cloud.
- **Révocation.** L'utilisateur déconnecte un assistant depuis **Mon compte › Assistants IA** ; le jeton d'accès déjà délivré reste valable jusqu'à son expiration (1 h au plus), le jeton de rafraîchissement, lui, est révoqué.
- **Comptes anonymes.** Un compte « pseudo seul » peut connecter un assistant, mais il est purgé après **90 jours** sans activité ni email lié (voir [Rétention des données](../README.md#rétention-des-données)) — et la connexion avec lui. Lier un email garde le compte.

## Langue

Une erreur de tool commence par son code stable (`session_closed`, `invalid_api_token`, `requires_oauth`…), que l'agent peut tester, suivi du message traduit par `translateError`, comme dans l'app. Une erreur technique ne sort jamais telle quelle.

## Limites

- Le serveur OAuth de Supabase est en **bêta** : son comportement (écran de consentement, métadonnées, révocation) peut encore évoluer.
- Les jetons d'accès durent **1 heure** (`jwt_expiry`) ; les clients les rafraîchissent seuls, mais un client qui ne gère pas le rafraîchissement demandera de se reconnecter.
- Les **previews Vercel** ne sont pas des cibles OAuth fiables : le consentement suit la Site URL de Supabase, donc la production. Tester le parcours complet en local ou en prod.
- Le serveur est **sans état** : pas de notifications poussées vers l'assistant (une session qui passe au vote ne lui est pas signalée), il faut relire avec `get_session`.
- Un **jeton personnel** n'ouvre que le catalogue et les listes : sessions, votes, historique et profil demandent OAuth.

## Tests

- `src/lib/mcp/**/*.test.ts` — vérification des jetons (OAuth et personnels, `?key=`), tools, sorties minimisées.
- `src/app/llms.txt/route.test.ts` — tout tool enregistré est annoncé, avec sa connexion et son niveau de risque.
- `src/domain/restaurant-match.test.ts`, `src/use-cases/remember-restaurant.test.ts` — Vitest.
- `supabase/tests/ai-access.test.sql` — jetons, isolation entre comptes, idempotence, révocation, export ; `supabase/tests/oauth-connected-apps.test.sql` — garde-fou suppression/export (`bun run db:test`).
