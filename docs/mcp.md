# Connecter une IA (serveur MCP)

onmangekoi expose un serveur [MCP](https://modelcontextprotocol.io) : Claude, ChatGPT, Cursor ou n'importe quel client MCP peut tenir les listes d'une personne à sa place.

> « J'ai mangé à La Ba, c'était bon. »

L'IA cherche le resto dans le catalogue de l'app ; s'il n'y est pas, elle le cherche chez Google et l'importe ; puis elle le range dans la bonne liste — jamais deux fois.

## Brancher son IA

1. Dans l'app : **Mon compte → Connecter ton IA → Créer un jeton**. Le jeton (`omk_…`) ne s'affiche qu'une fois.
2. Le coller dans son client, au choix :

| Client                                       | Comment                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Claude.ai, ChatGPT (connecteur personnalisé) | URL `https://<site>/api/mcp?key=omk_…`                                                                     |
| Claude Code                                  | `claude mcp add --transport http onmangekoi https://<site>/api/mcp --header "Authorization: Bearer omk_…"` |
| Cursor, Claude Desktop, VS Code…             | bloc `mcpServers` avec `url` et l'en-tête `Authorization: Bearer omk_…`                                    |

La page compte génère les trois, prêts à copier. Un jeton se révoque d'un clic ; dix au plus par personne.

## Outils

| Outil                             | Ce qu'il fait                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `remember_restaurant`             | Le raccourci « j'ai mangé à… » : cherche, importe si besoin, range. Rend un statut (voir plus bas)  |
| `find_restaurant`                 | Recherche floue dans le catalogue (« la ba » trouve « La Ba » et « La Baraka »), avec `in_my_lists` |
| `search_google_places`            | Recherche Google — seulement si `GOOGLE_PLACES_API_KEY` est configurée                              |
| `add_restaurant`                  | Ajoute au catalogue, depuis Google (`google_place_id`) ou à la main                                 |
| `my_lists`, `get_list`            | Lire ses listes, avec leur lien de partage (`list_url`)                                             |
| `create_list`                     | Créer une liste                                                                                     |
| `add_to_list`, `remove_from_list` | Ranger ou retirer un resto — idempotents                                                            |
| `whoami`                          | Le pseudo au nom duquel agit le jeton                                                               |

Deux prompts sont aussi proposés (`/jai-mange`, `/partager-une-liste`), et le serveur envoie des **instructions** au client à l'initialisation : chercher avant de créer, ne jamais inventer d'id, répondre dans la langue de la personne.

### Statuts de `remember_restaurant`

| Statut            | Quand                                                                         | L'IA…                                                 |
| ----------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| `added`           | Le resto est rangé                                                            | confirme, donne le lien de la liste                   |
| `already_in_list` | Il y était déjà (dans la liste visée, ou dans une liste où il est déjà rangé) | le dit                                                |
| `ambiguous`       | Plusieurs homonymes, ou seulement des noms voisins (catalogue et/ou Google)   | demande lequel, puis `add_to_list` / `add_restaurant` |
| `choose_list`     | Plusieurs listes et aucune désignée                                           | demande laquelle, rappelle avec `list_id`             |
| `not_found`       | Rien nulle part                                                               | demande la ville, ou propose un ajout manuel          |

Un nom « identique » s'entend à la casse, aux accents et aux articles près (`la ba` = `Restaurant La Ba`, ≠ `La Baraka`) — voir `src/domain/restaurant-match.ts`. Dans le doute, l'outil n'agit pas : la liste se choisit **avant** tout import, pour qu'une question posée à la personne ne laisse rien derrière elle.

## Sécurité

- **Le jeton n'est jamais stocké** : seule son empreinte SHA-256 l'est (`api_tokens.token_hash`, illisible même par sa propriétaire). 192 bits d'aléa : pas de force brute.
- **L'autorisation se fait en base.** Le serveur MCP n'a ni cookie ni session ; la production signe ses JWT en ES256 avec une clé que l'app ne détient pas. Chaque outil appelle donc une RPC `mcp_*` (clé publiable, rôle `anon`) avec le jeton en premier argument ; `mcp_act_as` le résout, pose les claims du propriétaire pour la seule transaction, et chaque RPC revérifie que la liste visée lui appartient.
- Les ajouts de restos réutilisent `create_manual_restaurant` et `upsert_restaurant_from_place` : mêmes validations que l'app. Un import Google ne prend que l'identifiant du lieu ; la fiche est relue chez Google côté serveur.
- `?key=` met le jeton dans l'URL (journaux d'accès) : c'est le prix des clients qui ne savent pas envoyer d'en-tête. Préférer l'en-tête quand le client le permet ; révoquer en cas de doute.
- Le jeton part avec le compte (`on delete cascade`) et figure dans l'export RGPD (nom, 4 derniers caractères, dates — jamais l'empreinte).

## Langue

Les erreurs sont traduites comme dans l'app : `?lang=en`, sinon `Accept-Language`, sinon français. Les descriptions d'outils sont en anglais, la langue que les modèles lisent le mieux ; elles demandent de répondre dans celle de la personne.

## Pour les IA qui découvrent le site

`/llms.txt` présente l'app et la façon de s'y brancher.

## Tests

- `src/domain/restaurant-match.test.ts`, `src/use-cases/remember-restaurant.test.ts` — Vitest.
- `supabase/tests/ai-access.test.sql` — jetons, isolation entre comptes, idempotence, révocation, export (`bun run db:test`).
