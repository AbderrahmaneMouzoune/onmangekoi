# Mesure d'audience

Objectif : savoir **où les groupes décrochent** entre la création d'une session et le classement, et combien de sessions vont jusqu'au bout. Rien d'autre.

Outil : [PostHog](https://posthog.com) sur sa région **européenne** (`https://eu.i.posthog.com`), chargé côté navigateur uniquement.

## Interrupteurs

La mesure ne s'active que si les **deux** conditions sont réunies.

| Interrupteur                            | Effet quand il est ouvert                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_POSTHOG_KEY` absente       | module inerte : pas de bandeau, pas de script, `captureEvent()` ne fait rien   |
| Consentement pas encore donné ou refusé | le SDK n'est **pas téléchargé** : aucun cookie, aucun identifiant, aucun appel |

C'est ce qui rend les tests, la CI, les previews et le développement local silencieux par défaut : la clé n'y est simplement pas définie.

Le retrait du consentement (« Mon compte » → _Statistiques d'usage_) appelle `opt_out_capturing()` puis `reset()` : la capture s'arrête et ce que PostHog avait stocké est effacé.

## Ce qui ne sort jamais

- **Aucune donnée personnelle** : ni pseudo, ni email, ni nom de restaurant ou de liste.
- **Aucun secret d'accès** : le jeton d'invitation d'une session suffirait à la rejoindre, le code de partage d'une liste à la lire. Ils ne sortent pas — et comme ils vivent dans l'URL, **toutes** les URL sont masquées avant envoi (`src/lib/analytics/sanitize.ts`) :

  | URL réelle                       | Envoyé                   |
  | -------------------------------- | ------------------------ |
  | `/sessions/0f8fad5b-…/results`   | `/sessions/[id]/results` |
  | `/join/7K3M9P`                   | `/join/[invite]`         |
  | `/l/restos-du-bureau-H4V2Q8ZX0M` | `/l/[list]`              |
  | `/setup?next=%2Fjoin%2F7K3M9P`   | `/setup`                 |

  Le masquage passe par `before_send`, donc il s'applique à **toutes** les propriétés d'URL, y compris celles que PostHog ajoute lui-même (`$current_url`, `$referrer`, `$initial_*`…). Une route inconnue voit ses segments identifiants remplacés par `[id]` : une route ajoutée plus tard ne fuite pas par oubli.

- **Pas d'autocapture** (`autocapture: false`) : elle enverrait le texte des éléments cliqués, donc des pseudos. Pas d'enregistrement de session non plus.

Le seul identifiant transmis est l'**UUID du profil Supabase**, opaque, passé à `identify()` — c'est lui qui rend la rétention mesurable. `person_profiles: 'identified_only'` : les visiteurs sans pseudo n'ont pas de profil.

## Événements

| Événement         | Émis quand                                                       | Propriétés                                                                        |
| ----------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `session_created` | le host arrive sur sa session — donc création réellement aboutie | `session_id`, `restaurant_count`, `list_count`                                    |
| `invite_shared`   | copie du code, copie du lien, partage natif, ou affichage du QR  | `session_id`, `method`                                                            |
| `session_joined`  | un invité arrive dans une session qu'il vient de rejoindre       | `session_id`, `via` (`code` · `link` · `scan`)                                    |
| `vote_submitted`  | un vote est enregistré en base (pas une carte déjà votée)        | `session_id`, `value`, `kind`, `position`, `restaurant_count`                     |
| `session_closed`  | la session passe à `closed` sous les yeux d'un participant       | `session_id`, `reason` (`auto` · `host`), `participant_count`, `restaurant_count` |
| `list_shared`     | copie du lien de partage d'une liste                             | `method`                                                                          |
| `$pageview`       | à chaque changement de route, sur la route **masquée**           | —                                                                                 |

Le catalogue est typé (`src/lib/analytics/events.ts`) : une propriété non prévue ne compile pas. C'est le garde-fou qui empêche d'y glisser une donnée personnelle par inadvertance.

### Pourquoi un passage de témoin

Créer ou rejoindre une session se termine par un `redirect()` serveur : la Server Action ne rend jamais la main au composant qui l'a appelée. Un événement émis au moment du clic compterait donc aussi les échecs.

L'intention est déposée dans `sessionStorage` avant la navigation (`rememberSessionEntry`), puis consommée **une seule fois** à l'arrivée par `SessionRoom` (`takeSessionEntry`). Une création qui échoue n'est jamais consommée et expire au bout de cinq minutes. Sans intention retrouvée, une arrivée qui n'est pas celle du host est comptée comme une entrée par lien — le cas d'un `/join/<token>` ouvert directement.

## Tableau de bord à créer dans PostHog

Ces objets se configurent côté PostHog, pas dans le dépôt.

1. **Entonnoir « Du groupe au classement »**, sur 7 jours, par personne :
   `session_created` → `invite_shared` → `session_joined` → `vote_submitted` → `session_closed`.
   La marche la plus haute désigne l'étape à corriger.
2. **Entonnoir « Invité »**, pour isoler le parcours des non-hosts :
   `$pageview` sur `/join/[invite]` → `session_joined` → `vote_submitted`.
   À décomposer par `via` : un code dicté à l'oral et un QR scanné n'échouent pas pour les mêmes raisons.
3. **Rétention hebdomadaire** : cohorte d'entrée `session_created`, action de retour `session_created`.
4. **Répartition de `session_closed` par `reason`** : la part de clôtures forcées par le host mesure le vote qui n'aboutit pas — c'est l'indicateur qui justifiera (ou non) le vote chronométré (issue #9).
5. **Abandon en cours de vote** : `vote_submitted` moyen sur `position` rapporté à `restaurant_count`.

## Déploiement

Dans Vercel → _Settings → Environment Variables_ :

| Variable                   | Valeur                                                                           |
| -------------------------- | -------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_POSTHOG_KEY`  | clé projet PostHog — **production uniquement**, pour ne pas polluer les previews |
| `NEXT_PUBLIC_POSTHOG_HOST` | optionnelle — `https://eu.i.posthog.com` par défaut                              |

Côté PostHog, penser à cocher _Project Settings → Data management → Discard client IP data_ si l'IP n'est pas nécessaire.
