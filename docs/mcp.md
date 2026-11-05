# Assistants IA (MCP)

onmangekoi expose un **serveur MCP distant** : Claude, ChatGPT, Claude Code, Cursor ou n'importe quel client compatible peut chercher des restos, préparer une liste, lancer une session ou lire un classement au nom de l'utilisateur — avec exactement les droits qu'il a dans l'app, pas un de plus.

| Quoi                          | Où                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Serveur MCP (Streamable HTTP) | `https://<domaine>/api/mcp`                                                  |
| Résumé pour les agents        | `https://<domaine>/llms.txt` (convention [llmstxt.org](https://llmstxt.org)) |
| Serveur d'autorisation        | Supabase Auth, en mode serveur OAuth 2.1                                     |
| Page de consentement          | `https://<domaine>/oauth/consent`                                            |

## Architecture

```
client MCP (Claude, ChatGPT, Cursor…)
   │  POST /api/mcp   Authorization: Bearer <jeton OAuth Supabase>
   ▼
src/app/api/mcp/route.ts
   │  withMcpAuth(…, verifyMcpToken)          ── pas de jeton / jeton invalide → 401
   │     └─ supabase.auth.getClaims(jeton)       + WWW-Authenticate: resource_metadata=…
   │        signature (JWKS), expiration, émetteur, rôle authenticated, client_id
   ▼
src/lib/mcp/server.ts   createMcpHandler — un McpServer neuf par requête, sans état
   │  tools/catalog.ts · lists.ts · sessions.ts · me.ts
   ▼
src/lib/mcp/context.ts  runTool → client Supabase portant le jeton de l'utilisateur
   │  (createCallerClient : clé publishable + option accessToken = le jeton)
   ▼
PostgREST → RLS et RPC (`auth.uid()` = l'utilisateur), comme pour une session web
```

Le point clé : **le jeton OAuth est un jeton Supabase ordinaire** (`sub` = id de l'utilisateur, rôle `authenticated`, plus un claim `client_id`). Il est relayé tel quel à PostgREST, donc la RLS et les RPC `security definer` s'appliquent sans aucune règle propre au MCP. Les tools réutilisent `src/data-access`, `src/use-cases` et `src/domain` ; ils ne lisent jamais les cookies (`createServerClient`, `getCurrentUser`) — l'appelant est `caller.userId`, tiré du jeton.

Les tools reproduisent les revalidations des Server Actions équivalentes (`revalidateTag`, `revalidateLocalizedPath`), jamais `updateTag`, qui lève une erreur dans un route handler. Les notifications push partent d'un trigger en base : lancer ou clôturer une session depuis un assistant prévient le groupe comme depuis l'app.

La liste à jour des tools est dans [`/llms.txt`](../src/app/llms.txt/content.ts) ; un test vérifie que tout tool enregistré y figure.

## Découverte

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

## Activer en production

À faire une fois dans le dashboard Supabase, et à vérifier avant d'annoncer le serveur :

1. **Authentication › OAuth Server** : activer le serveur OAuth.
2. **Authorization Path** : `/oauth/consent`. Le chemin est relatif à la **Site URL**.
3. **Authentication › URL Configuration › Site URL** : le domaine de production (`https://<domaine>`), sans quoi le consentement part vers une mauvaise origine.
4. **Dynamic client registration** : activée. Les clients MCP ne connaissent pas onmangekoi à l'avance et s'enregistrent eux-mêmes.
5. **Project Settings › JWT Keys** : des **clés de signature asymétriques** (ES256) doivent être actives. Avec l'ancienne clé partagée HS256, `getClaims` ne peut pas vérifier localement et retombe sur `/auth/v1/user`, que Supabase Auth refuse aux jetons OAuth : tout appel MCP finirait en 401.

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

Partout, l'URL à saisir est celle du serveur, chemin compris : `https://<domaine>/api/mcp`. La première utilisation ouvre le navigateur sur onmangekoi pour se connecter et approuver l'assistant.

### Claude (web et desktop)

**Settings › Connectors › Add custom connector**, nom `onmangekoi`, URL `https://<domaine>/api/mcp`, puis **Connect**. Aucun client ID à fournir : Claude s'enregistre seul.

### ChatGPT

Activer le **developer mode** (**Settings › Apps & Connectors › Advanced settings**), puis **Create** un connecteur : URL `https://<domaine>/api/mcp`, authentification **OAuth**. ChatGPT s'enregistre seul lui aussi.

### Claude Code

```bash
claude mcp add --transport http onmangekoi https://<domaine>/api/mcp
```

Puis `/mcp` dans Claude Code pour lancer l'authentification.

### Cursor

Dans `~/.cursor/mcp.json` (ou `.cursor/mcp.json` du projet) :

```json
{
  "mcpServers": {
    "onmangekoi": { "url": "https://<domaine>/api/mcp" }
  }
}
```

Cursor propose ensuite de se connecter depuis **Settings › MCP**.

### MCP Inspector (déboguer)

```bash
npx @modelcontextprotocol/inspector
```

Choisir le transport **Streamable HTTP**, l'URL `http://localhost:3000/api/mcp` (ou celle de prod), puis **Open Auth Settings › Quick OAuth Flow** : l'Inspector rejoue toute la découverte pas à pas (401, métadonnées, DCR, consentement, jeton), ce qui permet de voir où un client échoue. Ensuite **Connect**, **List Tools**, et chaque tool s'appelle à la main.

## Sécurité

- **Pas de scopes métier.** Le serveur OAuth de Supabase ne propose pas de scopes personnalisés (seulement `openid`, `email`, `profile`, `phone`) : un assistant autorisé a les droits de l'utilisateur dans l'app, bornés par la RLS. D'où les deux points suivants.
- **Audience non vérifiable.** Le jeton porte `aud: authenticated`, pas l'URL de la ressource (Supabase n'applique pas l'indicateur de ressource RFC 8707). `verifyMcpToken` compense en exigeant l'émetteur du projet, le rôle `authenticated` et la présence de `client_id` : un jeton de session web volé dans un cookie n'ouvre pas le MCP.
- **Données minimisées.** Les sorties ne contiennent ni email, ni `host_id`, ni jeton d'invitation, ni uuid des autres participants — au plus leur pseudo — ni le code du classement public tant que le host ne l'a pas ouvert. Les lectures publiques (RPC `public_results`, `public_list`) restent aussi pauvres que dans l'app.
- **Actions irréversibles sous confirmation.** `vote`, `launch_session`, `close_session`, `confirm_decision` et `set_results_public` sont annotés `destructiveHint` : les clients qui en tiennent compte demandent une confirmation, et les consignes du serveur (`MCP_INSTRUCTIONS`) exigent de demander à l'utilisateur avant chaque geste qui engage le groupe. Les noms saisis par d'autres (restos, listes, sessions, pseudos) sont signalés au modèle comme des données, jamais des instructions.
- **Le compte reste à la personne.** Supprimer son compte (`delete_my_account`) et exporter ses données (`export_my_data`) sont refusés à tout jeton qui porte un `client_id` (`omk:forbidden_for_connected_apps`, migration `20261105120000_oauth_clients_cannot_touch_account.sql`, scénario `supabase/tests/oauth-connected-apps.test.sql`). Ces deux RPC sont des enveloppes autour de `*_unguarded` : une future modification se fait dans la fonction interne, jamais par `create or replace` sur l'enveloppe. Les endpoints de Supabase Auth (`/user` : changer d'email ou de mot de passe) refusent eux-mêmes les jetons OAuth depuis début novembre 2026 — à revérifier sur le projet cloud.
- **Révocation.** L'utilisateur retire l'accès d'un assistant depuis **« Mon compte »** ; le jeton d'accès déjà délivré reste valable jusqu'à son expiration (1 h au plus), le jeton de rafraîchissement, lui, est révoqué.
- **Comptes anonymes.** Un compte « pseudo seul » peut connecter un assistant, mais il est purgé après **90 jours** sans activité ni email lié (voir [Rétention des données](../README.md#rétention-des-données)) — et la connexion avec lui. Lier un email garde le compte.

## Limites

- Le serveur OAuth de Supabase est en **bêta** : son comportement (écran de consentement, métadonnées, révocation) peut encore évoluer.
- Les jetons d'accès durent **1 heure** (`jwt_expiry`) ; les clients les rafraîchissent seuls, mais un client qui ne gère pas le rafraîchissement demandera de se reconnecter.
- Les **previews Vercel** ne sont pas des cibles OAuth fiables : le consentement suit la Site URL de Supabase, donc la production. Tester le parcours complet en local ou en prod.
- Le serveur est **sans état** : pas de notifications poussées vers l'assistant (une session qui passe au vote ne lui est pas signalée), il faut relire avec `get_session`.
