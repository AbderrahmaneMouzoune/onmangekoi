# 🍴 onmangekoi

> Voter où manger avec ses collègues et amis, sans perdre 10 minutes à « je sais pas, comme tu veux ».

## Le principe

1. Tu choisis des restaurants — dans une de tes **listes** de favoris, dans le **carnet** des restos déjà connus, chez **Google** (ceux autour de toi, d'abord), ou en ajoutant le tien à la volée — et tu mélanges
2. Tu lances une **session**, tu envoies le code ou le lien au groupe — ou tu fais scanner le **QR code**
3. Chacun arrive, **ajoute son resto** à la sélection et peut inviter à son tour, tant que le vote n'a pas démarré
4. Chacun vote dans son coin, carte par carte : **bof** · **ça me va** · **coup de cœur** · **veto**
5. Quand tout le monde a voté (ou que l'heure limite tombe, ou que le host clôture), le **classement** s'affiche

**Zéro friction** : tout est utilisable avec un simple pseudo. Lier un email et un mot de passe est optionnel et ne sert qu'à retrouver ses listes depuis un autre appareil.

## Système de vote

| Action       | Valeur | Contrainte                           |
| ------------ | ------ | ------------------------------------ |
| Bof          | 0      | Illimité                             |
| Ça me va     | +1     | Illimité                             |
| Coup de cœur | +2     | **Quota par session** — 1 par défaut |
| Veto         | −2     | **Quota par session** — 1 par défaut |

`Score(restaurant) = Σ des votes`. Les votes manquants comptent 0. En cas d'égalité, le nombre de coups de cœur départage ; à égalité parfaite, le host tranche (voir [Départager une égalité](#départager-une-égalité)).

Les quotas de jokers et le seuil de clôture se règlent **à la création** — voir « Règles personnalisables » plus bas. Les règles (jokers restants, session en cours, participant, restaurant valide) sont vérifiées **en base** par la fonction `submit_vote`, pas seulement dans l'interface.

## Règles de session

| Règle               | Comportement                                                                           |
| ------------------- | -------------------------------------------------------------------------------------- |
| Lancement           | Réservé au host, à partir de 2 participants et 2 restaurants                           |
| Composition         | En attente, **chaque participant** ajoute ses restos et invite qui il veut             |
| Retrait             | Chacun retire ce qu'il a apporté ; le host arbitre ; le dernier resto reste            |
| Snapshot            | Les restaurants sont figés au lancement, pas à la création                             |
| Votes privés        | Chacun ne lit que ses votes ; le classement est une agrégation                         |
| Clôture automatique | Déclenchée en base dès que le seuil de votants est atteint — 100 % par défaut          |
| Clôture à l'heure   | Échéance optionnelle choisie à la création — le vote se ferme tout seul                |
| Clôture forcée      | Le host peut clôturer à tout moment — les votes manquants comptent 0                   |
| Vue host            | Qui a terminé, en temps réel (statut uniquement, jamais les votes)                     |
| Rejoindre           | Impossible une fois le vote lancé ; un participant existant retrouve sa session        |
| Départage           | À égalité parfaite, le host choisit : second tour entre les ex æquo, ou tirage au sort |

## Groupes récurrents

Les mêmes collègues votent chaque midi et retapaient le code à chaque session. À la fin d'une session, **« Sauvegarder ce groupe »** garde l'équipe du jour ; à la création de la suivante, **« Inviter un groupe »** la rappelle d'un clic.

| Geste                 | Où                                | Ce qui se passe                                                                      |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| Sauvegarder ce groupe | classement d'une session          | `create_group_from_session` recopie les participants — jamais une liste de noms      |
| Inviter un groupe     | création de session, ou l'attente | `invite_group_to_session` pose une **invitation en attente** par membre              |
| Rejoindre             | accueil, « On t'attend »          | l'invitation devient une participation, et disparaît                                 |
| Quitter un groupe     | `/account` ou `/groups`           | `leave_group` — on n'est plus pré-invité, les sessions déjà rejointes ne bougent pas |

**Une invitation n'est pas une participation.** C'est toute la règle : un membre pré-ajouté ne compte ni dans le nombre de participants, ni dans le quorum de lancement, ni dans les « 100 % ont voté » tant qu'il n'a pas ouvert la session. Sans cette séparation, une équipe de six pré-invités gèlerait le déjeuner de ceux qui sont là. La conversion se fait à un seul endroit — un trigger sur `session_participants` consomme l'invitation —, donc par n'importe quel chemin d'entrée : lien, code ou QR.

Un groupe ne se crée **que depuis une session vécue** : impossible d'y ajouter quelqu'un qu'on n'a pas croisé. Seuls ses membres le voient, seul son propriétaire le renomme ou le supprime, et c'est la RLS qui le dit. Le propriétaire ne peut pas le quitter — il le supprime, sinon le groupe survivrait sans personne pour le tenir.

Faute de notifications push (issue #7, qui attend le service worker de #11), l'invité est prévenu **dans l'app** : la session apparaît sur son accueil sous « On t'attend », avec un bouton pour la rejoindre ou la décliner. Le host, lui, voit les invités encore attendus dans la salle d'attente et garde son lien à copier.

## Vote chronométré

Le blocage le plus courant en vrai usage n'est pas le désaccord, c'est l'attente : une session reste ouverte tant qu'il manque un votant. Le host peut donc poser une **échéance** à la création — « dans 10 min » ou « à 12:00 » —, et la base s'en charge sans que personne n'ait à revenir cliquer.

| Ce qui est posé           | Ce qui se passe                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `sessions.closes_at`      | Instant absolu, optionnel. Sans lui, rien ne change : la session vit comme avant               |
| Job `pg_cron` à la minute | `close_expired_sessions()` ferme les sessions `voting` échues — les votes manquants comptent 0 |
| Compte à rebours          | Dans la salle d'attente, dans le deck de vote et sur l'écran d'attente des autres              |
| `extend_session()`        | Le host se donne 5 minutes de plus d'un clic, tant que la session n'est pas close              |

La clôture par échéance emprunte **exactement** le chemin de la clôture manuelle — `status = 'closed'`, `closed_at = now()` — donc les mêmes événements Realtime, le même classement, la même redirection pour tout le monde.

Une durée (« dans 10 min ») est datée par l'horloge du serveur au moment de la création ; une heure précise (« à 12:00 ») est convertie en instant absolu par le navigateur, seul à connaître le fuseau de la personne. Le compte à rebours se relit sur l'horloge à chaque seconde plutôt que de se décrémenter : un onglet revenu au premier plan affiche le temps réellement restant, pas celui qu'il aurait compté s'il n'avait pas dormi.

Une session **en attente** dont l'échéance tombe n'est jamais clôturée : sans un seul vote, le classement n'aurait aucun sens. `launch_session` refuse de la lancer et invite le host à prolonger — c'est la seule impasse possible, et elle a sa sortie.

## Départager une égalité

Deux restaurants au même score **et** au même nombre de coups de cœur : le classement l'annonçait, et le groupe repartait en débat. Le host a maintenant deux sorties, depuis la page de classement.

| Sortie             | Ce qui se passe                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Second tour**    | Une session neuve avec les seuls ex æquo, les mêmes participants — personne n'a à rejoindre — et les jokers remis à zéro. Le vote est ouvert d'emblée.      |
| **Tirage au sort** | Un tirage fait en base avec `gen_random_bytes`, écrit dans la session : tout le monde lit le même gagnant, y compris qui ouvre la page une heure plus tard. |

Le sort n'est **jamais** tiré côté client : un `Math.random()` par navigateur donnerait un gagnant par personne. Comme pour les codes d'invitation, la queue de l'espace tiré qui ne se divise pas en parts égales est rejetée plutôt que repliée — un modulo direct favoriserait les premiers candidats.

`session_results` porte l'état du départage dans une colonne `tiebreak` (`tied`, `runoff`, `winner`, `loser`) : l'interface n'a rien à recompter. Une fois le sort tombé, le désigné passe seul en tête et les ex æquo gardent leur score au rang suivant.

Le second tour retient d'où il vient (`sessions.parent_session_id`) : sa salle renvoie au classement du premier tour, et s'il finit lui-même à égalité, il se départage de la même façon. Une session n'a qu'un second tour, garanti par un index unique et pas seulement par la RPC.

Tant que l'égalité n'est pas tranchée, la page de classement suit la session en direct : le choix du host s'affiche chez les autres sans qu'ils rechargent.

## Règles personnalisables

Un coup de cœur, un veto, classement quand tout le monde a voté : ces règles conviennent à une tablée de quatre. À douze, il manque toujours quelqu'un, et un seul veto ne suffit plus à écarter ce qui ne passe pas. Le host règle donc les trois à la création, dans une section repliée — dépliée ou non, le résumé dit ce qu'on s'apprête à lancer.

| Règle            | Valeurs                  | Par défaut |
| ---------------- | ------------------------ | ---------- |
| Coups de cœur    | 0 à 5 par personne       | 1          |
| Vetos            | 0 à 5 par personne       | 1          |
| Seuil de clôture | 50 % à 100 % des votants | 100 %      |

Tout tient dans `sessions.rules`, un objet jsonb à trois clés dont le défaut reproduit exactement les règles d'avant : une session qui ne dit rien vit comme avant. Une contrainte `check` en borne les valeurs, et `create_session` complète les clés absentes — le formulaire n'envoie que ce qu'il change.

La base reste seule juge : `submit_vote` compte les jokers déjà posés au lieu de lire un booléen, et le trigger de clôture compare le nombre de votants arrivés au bout à `ceil(participants × seuil)`, jamais moins d'un. Sous 100 %, le classement tombe avant que tout le monde ait voté — les bulletins manquants comptent 0, comme lors d'une clôture forcée — et le deck de celui qui votait encore s'arrête proprement sur le classement.

Les règles sont **figées au lancement** : un trigger refuse toute écriture de `rules` sur une session qui n'est plus en attente, quel que soit le rôle. Changer les quotas alors que des vetos sont déjà posés invaliderait des bulletins après coup. `session_preview` les expose enfin à l'écran d'invitation : savoir qu'on n'aura pas de veto fait partie de ce à quoi on dit oui.

## Anti-fatigue

Le même restaurant gagne trois vendredis de suite et le vote devient une formalité. L'app ne l'interdit pas — elle le **dit**, et propose de l'écarter d'un clic.

| Où                  | Ce qui s'affiche                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Choix des restos    | Badge doré « Gagnant il y a 6 jours » sur la ligne — dans le carnet comme chez Google                           |
| Création de session | Case « Exclure les gagnants récents » — la ligne écartée se grise et se décoche, le panier et le bouton suivent |
| Carte de vote       | Mention discrète « Déjà gagnant le 28 août », chargée avec la session                                           |

La source est la RPC `recent_winners()` : les restaurants sortis **premiers** des sessions closes auxquelles la personne a participé dans les 30 derniers jours, avec la date du dernier sacre. Elle ne prend pas d'identifiant — elle répond pour `auth.uid()`, jamais pour quelqu'un d'autre — et ne renvoie que le gagnant : ni score, ni classement complet, ni qui a voté quoi.

Un classement où personne n'a dit oui (score nul ou négatif en tête) ne sacre personne : cette session-là n'a fatigué personne, et écarter toute la liste à la suivante n'aurait aucun sens. Deux restaurants à égalité parfaite en tête sont deux gagnants, comme à l'écran de classement — sauf si le host a tiré au sort : seul le désigné compte alors.

L'exclusion est appliquée **côté serveur**, dans le use-case de création : une liste apporte des restaurants que l'écran n'a jamais montrés un par un. Si elle ne laisse rien, la session n'est pas créée — le formulaire le dit plutôt que de partir avec zéro resto.

La fenêtre de 30 jours est une constante : `recent_winners_window()` en base, `RECENT_WINNER_WINDOW_DAYS` côté application, les deux figées par `supabase/tests/recent-winners.test.sql`.

## URLs, codes et liens de partage

Aucune URL n'expose d'identifiant technique : chaque ressource s'adresse par **son code court**, celui qu'on se dit à voix haute.

| Route                    | Exemple                    | Qui la voit                   |
| ------------------------ | -------------------------- | ----------------------------- |
| Salle de session         | `/sessions/7K3M9P`         | participants                  |
| Classement               | `/sessions/7K3M9P/results` | participants                  |
| Invitation (lien + QR)   | `/join/7K3M9P`             | qui reçoit le lien ou le code |
| Liste, côté propriétaire | `/lists/H4V2Q8ZX0M`        | propriétaire                  |
| Mes groupes              | `/groups`                  | membres des groupes           |
| Liste partagée           | `/l/H4V2Q8ZX0M`            | qui reçoit le lien            |
| Classement public        | `/r/H4V2Q8ZX0M`            | tout le monde, sans pseudo    |

| Objet             | Code          | Forme         |
| ----------------- | ------------- | ------------- |
| Session           | 6 caractères  | `7K3 M9P`     |
| Liste             | 10 caractères | `H4V2Q-8ZX0M` |
| Classement public | 10 caractères | `H4V2Q-8ZX0M` |

Les codes utilisent l'alphabet **Crockford base32** (`0-9`, `A-Z` sans `I`, `L`, `O`, `U`) : pas de lettre ambiguë à l'oral ni à l'écrit. La saisie est tolérante — minuscules, espaces, tirets, `I`/`L` lus comme `1`, `O` comme `0` — et un lien collé entier est accepté.

Chaque page redirige vers sa forme canonique : un code tapé en minuscules ou avec des tirets, comme un ancien lien (uuid de session ou de liste, jeton hexadécimal de partage, `/l/<slug>-<CODE>`), retombe sur l'URL du moment. Rien de ce qui a déjà été partagé ne casse.

Le code d'invitation peut aussi être **scanné** : la page « Rejoindre » ouvre la caméra (`BarcodeDetector` natif, repli `jsqr`) et lit le QR affiché dans la salle d'attente — par le host comme par n'importe quel participant. Le QR s'y ouvre en plein écran d'une touche : c'est à cette taille qu'il se fait scanner à bout de bras.

### Partager le classement

`/r/<code>` est la seule page de session ouverte sans pseudo. Elle porte **son propre code**, distinct de celui de l'invitation : un lien collé dans une conversation ne donne jamais accès à la salle de vote, et le refermer ne casse pas l'invitation.

- **Opt-in du host** : `sessions.results_public` est faux par défaut, et seule la RPC `set_results_public` — host, session close — le change.
- **Ce qui sort** : le nom de la session, le nombre de participants, et le podium (rangs 1 à 3). La RPC `public_results` ne renvoie rien d'autre : ni pseudo, ni détail des votes, ni le reste du classement.
- **Aperçu** : l'`opengraph-image` de la route affiche le gagnant et son score sur l'ardoise, et se cache une heure — de quoi tenir un lien qui circule.
- **Refermer** est immédiat : la bascule purge l'entrée de cache du lien, la page redevient introuvable.

## Fiche restaurant

Chaque restaurant peut porter une photo, une adresse, un site, des coordonnées et des horaires. Tout est optionnel : sans la donnée, le bloc concerné disparaît au lieu de s'afficher vide.

| Colonne          | Forme                                                                                 | Usage                                            |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `photo_url`      | HTTPS, hôte autorisé                                                                  | fond de la carte de vote, vignette du classement |
| `address`/`city` | texte                                                                                 | ligne d'adresse, repli du lien d'itinéraire      |
| `website`        | HTTP(S)                                                                               | bouton « Le site » sur le gagnant                |
| `location`       | `{"lat": number, "lng": number}`                                                      | lien d'itinéraire et mini-carte du gagnant       |
| `opening_hours`  | `{"timezone"?: string, "periods": [{"day": 0-6, "open": "HH:MM", "close": "HH:MM"}]}` | badge « ouvert / fermé » sur la carte de vote    |
| `tags`           | `text[]` parmi `vegetarian`, `vegan`, `halal`, `kosher`, `gluten_free`                | filtre « régime », chips sur la carte de vote    |

`day` suit `Date#getDay` (0 = dimanche) ; une période dont la fermeture précède l'ouverture passe minuit (`22:00 → 02:00`), y compris par-dessus la fin de semaine. Le fuseau est celui du restaurant quand il est connu, celui du visiteur sinon. Les formes `jsonb` sont validées en base (`is_geo_point`, `is_opening_hours`) **et** à la lecture : une donnée importée reste une donnée externe.

Les images distantes ne sont chargées que depuis les hôtes de `ALLOWED_IMAGE_HOSTS` (`src/lib/images.ts`), synchronisés avec `images.remotePatterns` de `next.config.mjs` — un test échoue si les deux listes divergent. Une URL hors liste n'est pas rendue plutôt que de faire échouer `next/image`. La carte visible du deck charge sa photo en `priority`, celle du dessous en `lazy`.

La mini-carte du gagnant est un bloc de 2×2 tuiles [OpenStreetMap](https://www.openstreetmap.org/copyright) et un repère positionné en pourcentage : pas de clé d'API, pas de JavaScript de cartographie. L'attribution ODbL est affichée sous la carte.

## Base de restaurants

| Source   | Origine                                                       | Qui peut modifier |
| -------- | ------------------------------------------------------------- | ----------------- |
| `seed`   | livrée avec le schéma                                         | personne          |
| `manual` | ajoutée depuis l'app (nom, cuisine, adresse, budget, régimes) | son créateur      |
| `google` | importée depuis Google Places                                 | son importateur   |

Le formulaire « Ajouter un resto à la main » est disponible partout où l'on choisit des restaurants — création de session, salle d'attente, liste, liste partagée — et le resto créé est sélectionné aussitôt, sans rechargement.

La déduplication est **souple** : un nom proche (recherche trigram) déclenche un avertissement et propose le resto existant en un clic, mais ne bloque jamais l'ajout — deux restos peuvent légitimement porter le même nom.

### Choisir des restaurants

Le sélecteur (`components/restaurants/restaurant-picker.tsx`) met les sources **au même niveau** — un onglet chacune, dans un rail commun — et les verse dans un **seul panier** :

| Onglet         | Ce qu'on y coche                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Mes listes** | Une liste entière, d'un bloc — plusieurs si on veut. Ses restos apparaissent alors cochés et verrouillés ailleurs              |
| **Le carnet**  | Tous les restos déjà connus de l'app — livrés avec le schéma, ajoutés à la main, importés de Google — filtrés par la recherche |
| **Google**     | D'abord les restos **autour de soi**, sans rien taper ; puis ce qu'on cherche par son nom                                      |

Le panier reste visible au-dessus des onglets, quel que soit celui qui est ouvert : une pastille dorée par liste, une rouge par resto pioché à l'unité, un clic retire l'une ou l'autre, « Tout retirer » vide le panier. Les pastilles tiennent sur **une seule ligne qui défile** : le panier garde la même hauteur qu'on ait pris deux restos ou vingt, et la liste de résultats en dessous ne descend jamais. Mélanger une liste, deux restos du carnet et un import Google est le cas normal, pas une exception. L'onglet « Mes listes » n'existe que là où ça a un sens — la création de session — et « Google » que si la clé est configurée ; avec une seule source, le rail disparaît.

Chaque résultat, du carnet comme de Google, est une **carte** (`components/restaurants/result-row.tsx`) : une vignette — la photo importée, sinon une tuile colorée aux initiales du resto —, le nom, un badge « ouvert / fermé » quand les horaires sont connus, une ligne de faits (cuisine · budget · note Google) et l'adresse. Le carnet a son propre bouton « **Autour de moi** » : la position est la même que celle de l'onglet Google, et chaque resto géolocalisé affiche alors sa distance à vol d'oiseau (`distanceLabel`, `src/lib/maps.ts`) ; un second clic l'oublie. Sans coordonnées, la carte s'affiche simplement sans distance, et la position ne quitte jamais le navigateur autrement que pour biaiser la recherche Google.

Deux écrans se ressemblaient trop : **créer une liste** et **créer une session** choisissent tous deux des restos. Ils ont désormais chacun leur signature. La session avance en **trois étapes numérotées en rouge** (nom, restos, clôture) et se termine par « Créer la session » ; la liste s'ouvre sur une **carte dorée au signet** qui dit ce qu'elle est — une réserve à ressortir, pas un vote — et se termine par « Enregistrer la liste ».

### Filtres du carnet

Trois filtres au-dessus des résultats du **carnet** — budget, régime, distance. Ils ne concernent que lui : Google a sa propre recherche, et une liste de favoris se prend entière. Ils se combinent, et leur état se lit dans l'URL de la création de session — un lien part donc déjà trié.

| Filtre   | Paramètre               | Ce qu'il garde                                       |
| -------- | ----------------------- | ---------------------------------------------------- |
| Budget   | `budget=1`…`4`          | `price_level` inférieur ou égal au cran choisi       |
| Régime   | `tags=vegan,halal`      | les restos qui servent **tous** les régimes demandés |
| Distance | `km=0.5`, `1`, `2`, `5` | les restos à moins de n km de la position            |

Tout est filtré **en base**, par la RPC `search_restaurants` : c'est ce qui garde la pagination juste. Une page réduite après coup côté navigateur sauterait des résultats à chaque « Afficher plus ». La distance y est une haversine sur `location` (`geo_distance_km`), sans PostGIS : un rayon de quartier n'en demande pas tant. Rayon actif, les résultats passent du plus proche au plus loin.

**Une donnée absente n'est pas une donnée favorable.** Budget inconnu sous « ≤ €€ », aucun régime déclaré sous « vegan », coordonnées manquantes sous un rayon : le resto sort des résultats, et l'interface le dit sous les chips plutôt que de laisser croire à un carnet plus pauvre qu'il n'est. Rien ne passe les filtres ? La liste propose de les lever, pas d'ajouter un resto qui s'y trouve peut-être déjà.

**Le rayon suit la position, il ne la demande pas.** C'est « Autour de moi », au ras des résultats, qui l'obtient — la même que l'onglet Google. Sans elle, les chips de distance n'existent pas ; un second clic sur « Autour de toi » les fait disparaître et la recherche repart sans rayon. Un lien portant `?km=1` arrive donc sans filtre distance tant que personne n'a autorisé sa position : le serveur ne la connaîtra jamais, et elle est arrondie à ~110 m avant de servir de clé de cache pour que deux personnes du même bureau partagent la même entrée au lieu d'en créer une par GPS.

Les régimes (`vegetarian`, `vegan`, `halal`, `kosher`, `gluten_free`) sont une liste blanche tenue **en base** par `restaurant_tag_values()`, que la contrainte `restaurants_tags_allowed` fait respecter : en ajouter un demande une migration. Ils se déclarent à l'ajout manuel d'un resto, l'import Google ramène le seul que Google connaisse, et la carte de vote les affiche.

### Import Google Places

Quand `GOOGLE_PLACES_API_KEY` est configurée, un onglet **Google** apparaît dans le sélecteur. Il s'ouvre sur les **restos les plus proches** : la position est demandée au clic sur l'onglet, et tant qu'on ne tape rien, c'est ça qu'on voit — classés par distance, avec la distance à côté de chaque nom. Taper un nom lance une recherche, biaisée par la même position quand elle est connue. Sans position (refus, navigateur muet), l'onglet le dit et la recherche par nom reste possible. « **Voir plus** », en bas de la liste, demande les vingt suivants tant que Google en a.

Les pages reçues restent en mémoire le temps du formulaire : quitter l'onglet et y revenir retrouve les résultats tels quels, sans rechargement ni nouvel appel.

#### Amorcer son quartier

Un groupe qui arrive devant un carnet vide n'a pas à le remplir resto par resto. Une fois la position accordée — et seulement à ce moment-là, le bouton n'existe pas avant —, « **Amorcer mon quartier** » fait entrer les **vingt restos les plus proches** d'un coup, depuis l'onglet Google de la création de session comme de `/lists/new`. Ils rejoignent le carnet ; ils ne rejoignent pas le panier : remplir la base et composer une session restent deux gestes.

Le navigateur n'envoie qu'une position — ni nombre de lieux, ni rayon. Le plafond de vingt est appliqué par le serveur, et le quota — **trois amorçages par personne et par tranche de 24 h** — est tenu en base par `claim_neighbourhood_import()` : le créneau se prend **avant** l'appel à Google, avec un verrou sur le profil de l'appelant pour qu'une rafale de requêtes se compte une par une. Le journal `neighbourhood_imports` ne sert qu'à ça : il se purge de lui-même passé la fenêtre, ne se lit hors de la RPC par personne, et part avec le compte.

Un lot ne s'annule pas pour un raté : chaque lieu est écrit séparément, ce qui est entré reste entré, et le message le dit — « 18 restos sont entrés dans le carnet, 2 n'ont pas pu être enregistrés ». Le catalogue partagé n'est invalidé **qu'une fois**, à la fin du lot.

Cocher un résultat le **sélectionne à l'instant** — la ligne et le panier le montrent coché, avec une roue le temps que la fiche arrive — puis l'import suit ; s'il échoue, le resto ressort de la sélection et l'onglet dit pourquoi. Un lieu déjà en base — importé à l'instant ou connu du carnet — se coche et se décoche sans rien demander à Google.

| Garantie           | Comment                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Clé jamais exposée | La recherche passe par `POST /api/places/search`, côté serveur ; la variable n'est pas préfixée `NEXT_PUBLIC_`                               |
| Zéro doublon       | `upsert_restaurant_from_place` est idempotente sur `place_id`, garantie par un index unique                                                  |
| Données de source  | Le navigateur n'envoie qu'un `place_id` à l'import ; les champs enregistrés sont relus côté serveur, jamais reçus du client                  |
| Coût maîtrisé      | Réponses gardées 24 h en mémoire, par page ; deux masques de champs distincts (voir ci-dessous)                                              |
| Autour de moi      | Text Search (New) sur « restaurant », `rankPreference: DISTANCE`, biais de 2 km, vingt lieux par page ; cache par position arrondie à ~100 m |
| Amorçage borné     | Vingt lieux par lot, plafond appliqué côté serveur ; trois lots par personne et par 24 h, comptés en base                                    |

L'import remplit la fiche décrite plus haut : `photo_url`, `website`, `location`, `opening_hours` et `description`. Un lieu réimporté rafraîchit ces champs sans jamais en effacer un déjà connu — ce qui fait aussi office d'entretien, l'adresse d'une photo Google n'étant pas éternelle.

Google ne connaît qu'un régime alimentaire, `servesVegetarianFood`. Il est demandé sur le détail d'un lieu, au même palier de facturation que le résumé déjà demandé : un import arrive donc tagué « végétarien » quand Google l'affirme, et ce régime s'ajoute à ceux déjà posés à la main au lieu de les remplacer.

Le fuseau des horaires n'est pas demandé à Google : `opening_hours.timezone` reste absent et l'app raisonne dans celui du visiteur.

**Deux masques de champs, deux factures.** Google facture au champ le plus cher demandé, et une recherche ramène vingt résultats : elle ne demande donc que de quoi afficher une liste. Le budget la place déjà dans le palier « Enterprise » de Text Search ; la **note, le nombre d'avis et les horaires** relèvent du même palier et sont donc demandés aussi, sans surcoût — la note s'affiche dans la liste et n'est jamais enregistrée, elle sert à choisir, pas à voter. Photo, site et résumé ne sont demandés que sur le détail d'un lieu — une fois, au clic sur « importer ». Un amorçage de quartier ne paie donc qu'**une recherche** pour ses vingt fiches : photo, site et résumé leur arrivent plus tard, à la première **carte de vote** qui les affiche (`useCompletedRestaurant`) — un détail par resto réellement regardé, jamais vingt d'avance pour des fiches que personne n'ouvrira. La photo coûte un appel de plus, pour convertir son nom de ressource en adresse servable : celle de l'endpoint media exigerait la clé pour être chargée, on stocke donc le `photoUri` qu'il renvoie, servi par Google sans clé et sur un hôte de `ALLOWED_IMAGE_HOSTS`.

**Quand la recherche échoue.** Le message affiché nomme la famille de panne plutôt que de renvoyer tout le monde vers un « réessaie » indifférencié, et le log serveur (`places: recherche → <statut> <raison>`) donne la raison exacte renvoyée par Google — `PERMISSION_DENIED`, `SERVICE_DISABLED`, `RESOURCE_EXHAUSTED`…

| Message affiché                            | Statut Google  | Où regarder                                                                                                                                                                                           |
| ------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Google refuse la clé de ce déploiement » | 401 / 403      | Clé absente ou invalide ; **restriction par référent HTTP** alors que l'appel part du serveur (restreindre par API, pas par site) ; « Places API (New) » pas activée ; facturation non liée au projet |
| « Trop de recherches Google d'un coup »    | 429            | Quota par minute atteint dans Google Cloud                                                                                                                                                            |
| « Google n'a pas répondu à temps »         | aucune réponse | Rien reçu en 8 s : réseau ou lenteur passagère                                                                                                                                                        |
| « La recherche Google a échoué »           | 5xx            | Incident côté Google, passager                                                                                                                                                                        |

L'ancienne « Places API » ne suffit pas : c'est **Places API (New)** qu'il faut activer, les deux se ressemblant beaucoup dans la console.

Sans clé, l'onglet n'apparaît pas et le reste de l'app fonctionne à l'identique.

## Écran large et clavier

L'app est pensée pour le téléphone, mais un lien de session arrive aussi souvent par Teams ou Slack, sur un poste de travail. À partir de 1024 px, chaque écran se déploie en grille au lieu d'étirer la colonne mobile :

| Écran               | Sur grand écran                                                                   |
| ------------------- | --------------------------------------------------------------------------------- |
| Accueil             | accroche et « comment ça marche » face à face, sessions et listes dessous         |
| Salle d'attente     | invitation (code, QR, liens) à gauche, participants et lancement à droite         |
| Vote                | la carte garde la largeur d'un téléphone, les quatre boutons viennent à sa droite |
| Classement          | le gagnant et sa carte à gauche, le reste du classement et le partage à droite    |
| Création, listes    | nom et bouton d'envoi dans une colonne collante, sélecteur de restos à côté       |
| Pseudo, code, login | colonne étroite, centrée : un seul geste à faire                                  |

`Shell` (`src/components/layout/shell.tsx`) porte ces trois largeurs (`narrow`, `reading`, `app`) ; l'en-tête gagne une navigation principale marquée `aria-current` sur la page en cours.

Tout se fait au clavier, et `?` affiche l'aide dans l'app :

| Touches                      | Où                                                   | Effet                                                                 |
| ---------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| `n` puis `s`                 | partout                                              | nouvelle session                                                      |
| `n` puis `l`                 | partout                                              | nouvelle liste                                                        |
| `g` puis `h` `j` `l` `g` `a` | partout                                              | aller à l'accueil, rejoindre, mes listes, mes groupes, mon compte     |
| `/`                          | partout                                              | chercher un resto (focus sur le champ de recherche)                   |
| `?`                          | partout                                              | l'aide des raccourcis                                                 |
| `Tab` (premier appui)        | partout                                              | « Aller au contenu » : saute l'en-tête                                |
| `↑` `↓` (`←` `→` en ligne)   | sessions, listes, groupes, résultats, sélection      | se balader d'un élément au suivant, `Début` et `Fin` aux extrémités   |
| `1` `2` `3` `4`              | vote                                                 | veto · bof · ça me va · coup de cœur, dans l'ordre des boutons        |
| `←` `→` `Entrée`             | vote                                                 | bof · ça me va · ça me va — le sens du swipe                          |
| `←` `→` `Début` `Fin`        | onglets des sources, budget, échéance                | passe d'une option à l'autre (un seul arrêt de tabulation par groupe) |
| `Échap`                      | scanner QR, ajout de resto, bouton à confirmer, aide | ferme, annule, désarme                                                |

Les séquences (`src/lib/shortcuts.ts`) ne se déclenchent jamais dans un champ de saisie ni dans une modale, et une lettre tenue avec `Ctrl`, `Alt` ou `⌘` reste au navigateur. Le focus est toujours visible (contour tomate, `:focus-visible` global), il revient sur le bouton qui a ouvert un panneau quand celui-ci se ferme, et chaque changement d'état de la session — lancement du vote, clôture — est annoncé aux lecteurs d'écran et reçoit le focus.

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
| Tests      | Vitest 5 + Testing Library · Playwright · axe-core · Lighthouse CI                       |
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

| Script                    | Rôle                                                          |
| ------------------------- | ------------------------------------------------------------- |
| `bun run dev`             | serveur de développement                                      |
| `bun run build`           | build de production                                           |
| `bun run check`           | typecheck + lint + format + tests unitaires                   |
| `bun run test`            | Vitest (unitaires + composants)                               |
| `bun run test:e2e`        | Playwright, flow complet host + invité et audit axe (`E2E=1`) |
| `bun run test:lighthouse` | Lighthouse Accessibilité sur les pages publiques              |
| `bun run db:types`        | régénère les types TypeScript depuis la base locale           |

## Architecture

```
src/proxy.ts             rafraîchit la session, protège les routes (redirige vers /setup?next=…)
src/config/              router.config.ts : préfixes protégés, longueurs de codes, `router.*()`
src/app/                 routes App Router (setup, login, join/[code], sessions/[code], lists/[code], l/[code], groups, account, nouveautes, legal, auth, api/places)
src/components/          ui/ (primitives) · layout/ · home/ · session/ · lists/ · groups/ · account/ · restaurants/ · onboarding/ · changelog/
src/content/changelog/   notes de version produit (schéma Zod + entrées), lues par /nouveautes et son flux RSS
src/data-access/         requêtes Supabase, un module par table + places.ts (Google) + recent-winners.ts (anti-fatigue) + models/ (types générés)
src/use-cases/           logique métier composée (créer / rejoindre / voter / importer / onboarding)
src/domain/              règles et vocabulaire métier : votes, codes de partage, erreurs, horaires, places, anti-fatigue, schemas/ (Zod)
src/actions/             Server Actions (validation Zod, auth, revalidate/redirect)
src/lib/                 utilitaires transverses : Crockford (`codeFromSegment`), format, routing, site (URL absolues), qr,
                         images (hôtes autorisés), maps (itinéraire, tuiles), ttl-cache, version (semver), changelog-seen
src/lib/analytics/       consentement, masquage des URL, catalogue d'événements, chargement de PostHog
src/hooks/               Realtime de session, compte à rebours, debounce, `useCanShare`, `useIsClient`, `useOpenNow`
supabase/migrations/     schéma, RLS, RPC (create/join/launch/add|remove_session_restaurant/submit_vote/close/extend/
                         results/recent_winners, départage, groupes et invitations), purge, RGPD
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

Le catalogue étant partagé, la recherche du sélecteur de restaurants sort du cache elle aussi : une même requête ne touche la base qu'une fois par heure, pour tout le monde. C'est ce qui rend l'ajout d'un resto en salle d'attente gratuit côté base : le catalogue n'y est envoyé que tant que la session est en attente, jamais pendant le vote. Après un import de restaurants, `revalidateTag(RESTAURANTS_CACHE_TAG)` suffit à le rafraîchir.

## Accessibilité

Le deck se vote entièrement au clavier, la charte tient le contraste AA dans ses deux thèmes, et rien de tout ça n'est laissé à la relecture : quatre garde-fous tournent en intégration continue.

| Garde-fou                | Où                               | Ce qu'il tient                                                                                             |
| ------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Audit axe                | `e2e/accessibility.spec.ts`      | Chaque page du parcours passe sous axe (WCAG 2.1 A et AA) ; toute violation `serious` ou `critical` échoue |
| Contraste des tokens     | `src/app/theme-contrast.test.ts` | Lit `globals.css` et refuse toute paire texte/fond sous 4.5:1 — en clair comme en sombre                   |
| Rôle et nom accessible   | `src/components/ui/*.test.tsx`   | Chaque primitive expose le rôle et le nom attendus                                                         |
| Lighthouse Accessibilité | `.lighthouserc.json`             | Score ≥ 95 sur les pages publiques (accueil, connexion, pseudo, confidentialité)                           |

### Le deck au clavier

| Touche               | Vote         |
| -------------------- | ------------ |
| `1`                  | Veto         |
| `2` ou `←`           | Bof          |
| `3`, `→` ou `Entrée` | Ça me va     |
| `4`                  | Coup de cœur |

Les chiffres suivent l'ordre des boutons, de gauche à droite. Les jokers n'ont ni flèche ni geste : un swipe ou une touche de direction ne doit jamais en griller un par accident.

La carte change sans que le focus bouge : une région `aria-live` annonce l'avancement à chaque fois — « Coup de cœur enregistré. Restaurant 2 sur 5 : Chez Marcel. » La progression porte son `aria-valuenow`, les erreurs sortent en `role="alert"`.

Le détail — seuils, façon de lire un échec, ce que l'automatique ne voit pas — est dans [`docs/accessibility.md`](docs/accessibility.md).

## Sécurité

- **Aucune table n'est lisible en `using (true)`.** Les tokens et codes d'invitation ne se résolvent que via des fonctions `security definer` qui prennent le secret en argument et renvoient uniquement la ligne visée. Les codes qui figurent dans les URL privées (`/sessions/…`, `/lists/…`) ne contournent rien : la RLS filtre la lecture comme pour un id.
- **Aperçu d'invitation** (`session_preview`) : un visiteur non authentifié — typiquement le robot qui déplie le lien dans une conversation — n'obtient un aperçu par code court que sur une session **en attente**, et seulement le nom, le pseudo du host et deux compteurs. Rejoindre exige toujours un compte.
- **Toutes les écritures métier passent par des RPC** transactionnelles (`create_session`, `join_session`, `launch_session`, `submit_vote`, `close_session`) qui revérifient les règles côté base.
- Composer une session est ouvert à ses participants, pas à tout le monde : `add_session_restaurant` et `remove_session_restaurant` revérifient en base l'appartenance, le statut `waiting` et — au retrait — la paternité du resto (`added_by`) ou la qualité de host. Aucune policy RLS n'ouvre l'écriture directe sur `session_restaurants`.
- Les votes individuels ne sont jamais exposés : `session_results` renvoie un agrégat.
- **Anti-fatigue** (`recent_winners`) : la fonction ne prend aucun identifiant et se borne à `auth.uid()` — impossible de demander ce qui fatigue quelqu'un d'autre. Elle ne rend que le restaurant gagnant et la date de clôture : le reste du classement et le détail des votes n'en sortent pas.
- Un **groupe** n'est visible que de ses membres et modifiable que par son propriétaire (RLS) ; la création, l'invitation et le départ passent par des RPC (`create_group_from_session`, `invite_group_to_session`, `leave_group`) qui revérifient tout en base. Une invitation en attente n'ouvre aucun accès à la session : l'invité n'en lit que le nécessaire, via `my_session_invitations`.
- L'ajout d'un restaurant passe par `create_manual_restaurant`, qui pose elle-même `created_by` et `source` : impossible de se faire passer pour quelqu'un d'autre ni de se faire passer pour du seed. Les policies RLS portent la même règle pour toute écriture directe, et la modification reste réservée au créateur.
- La clé Google Places ne quitte jamais le serveur, et aucune policy RLS n'ouvre l'écriture en `source = 'google'` : `upsert_restaurant_from_place` est le seul chemin. Les corps d'erreur renvoyés par Google restent dans les logs serveur.
- **Le départage d'une égalité est décidé en base.** `draw_winner` tire le gagnant et le conserve dans `sessions.tiebreak_winner_id` : le client n'a rien à choisir, et un second appel ne rejoue pas le sort. `create_runoff_session` recopie elle-même participants et restaurants ; les deux sont réservées au host d'une session close.
- Les codes d'invitation font 6 caractères et les codes de partage de liste 10, sur l'alphabet Crockford base32 (32 symboles, ≈ 1 milliard et ≈ 10¹⁵ combinaisons), tirés uniformément avec `gen_random_bytes` et reprise sur collision. Un code court ne tient que si on ne peut pas l'essayer en boucle : voir [Anti-abus](#anti-abus).
- Les pages sont rendues avec des chargements parallèles (`Promise.all`) et les lectures par requête sont dédupliquées via `React.cache` (`getCurrentUser`, `getProfile`, `getSessionById`…).
- **Aucune donnée personnelle n'est mise en cache.** Seul le catalogue public de restaurants est mémorisé, via un client Supabase sans cookie ; voir [Rendu et cache](#rendu-et-cache).
- Aucun utilisateur Supabase n'est créé sur une simple visite : uniquement au choix du pseudo.
- Les messages d'erreur Postgres ne remontent jamais tels quels : seuls les codes métier `omk:*` sont traduits.

## Anti-abus

Deux garde-fous, qui ne valent que posés ensemble : limiter les essais sert à peu de chose si créer une identité neuve est gratuit.

| Garde-fou                         | Où                             | Règle                                                                            |
| --------------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| Limite d'essais sur « Rejoindre » | `join_session` (base)          | 10 essais infructueux par 10 minutes et par compte, puis `omk:too_many_attempts` |
| Captcha à la création de compte   | `setupProfileAction` (serveur) | Cloudflare Turnstile, vérifié avant `signInAnonymously`                          |

Un essai qui ne tombe sur aucune session est journalisé dans `public.join_attempts` — table sans policy ni grant, invisible depuis l'app. Un code juste efface l'ardoise : deux fautes de frappe suivies d'une réussite ne pèsent jamais sur la tentative d'après. Les essais sont purgés dans les 24 h par le job nocturne (`run_maintenance()`), et la table ne retient qu'un identifiant de compte et un horodatage — jamais d'adresse IP.

Détail d'implémentation qui mérite d'être connu avant de toucher à `join_session` : un code inconnu fait **renvoyer NULL** à la RPC au lieu de lever `omk:session_not_found`. PostgREST exécute chaque appel dans une transaction, et une exception l'annulerait — avec elle, l'essai raté qu'on vient de compter. C'est `joinSession` (`src/data-access/sessions.ts`) qui rétablit l'erreur métier attendue par le reste de l'app. Les refus qui prouvent que le code était bon (session lancée, session close) restent des exceptions et ne comptent pas comme des essais.

Le captcha est **désactivé par défaut** : sans `NEXT_PUBLIC_TURNSTILE_SITE_KEY` **et** `TURNSTILE_SECRET_KEY`, aucun script n'est téléchargé et la vérification serveur laisse passer — c'est ce qui permet aux tests e2e, à la CI et au développement local de tourner sans compte Cloudflare. Le widget est en mode `interaction-only` : invisible, sauf pour les visiteurs que Cloudflare juge douteux. Si Cloudflare est injoignable, on laisse passer et on journalise : un captcha en panne ne doit pas fermer l'onboarding, et la limite d'essais côté base, elle, tient toujours. En l'activant sur un déploiement public, penser à mentionner Cloudflare sur `/legal/privacy`.

**Ce qui reste ouvert.** `session_preview` répond encore sans limite : un visiteur non authentifié obtient le nom et le host de n'importe quelle session `waiting` dont il devine le code court. La limite ci-dessus ne couvre que `join_session`, donc un balayage patient peut toujours _découvrir_ une session par cet oracle avant de la rejoindre en un seul appel. Fermer ce chemin veut dire réserver l'aperçu par code court aux personnes connectées — et donc renoncer à l'aperçu des liens `/join/7K3M9P` dépliés par WhatsApp ou Slack (les liens à jeton long, eux, restent hors de portée d'un balayage). C'est un arbitrage produit, laissé de côté ici volontairement.

Le scénario est rejouable avec `bun run db:test` (`supabase/tests/join-rate-limit.test.sql`).

## Vie privée

L'app est utilisable avec un simple pseudo, et les deux droits qui comptent au quotidien sont en libre-service depuis « Mon compte » :

| Droit                | Chemin            | Effet                                                                                                                                                 |
| -------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Export (portabilité) | `/account/export` | JSON téléchargeable — profil, listes, groupes, sessions hébergées, participations, restos apportés et votes — assemblé en base par `export_my_data()` |
| Suppression          | « Mon compte »    | `delete_my_account()` : profil, listes, groupes et compte auth supprimés en une transaction                                                           |

Supprimer un compte ne réécrit pas l'histoire des autres. Les votes déjà comptés dans une **session terminée** restent dans le classement mais perdent leur auteur (`Participant supprimé`) ; les sessions **en attente ou en cours** que le compte hébergeait sont supprimées, puisque sans host elles ne peuvent plus aboutir. La garantie est portée par le schéma (`on delete set null` sur `sessions.host_id` et `session_participants.profile_id`), pas seulement par la RPC : une suppression faite depuis le dashboard Supabase donne le même résultat.

Le détail des données conservées et de leurs durées est sur la page `/legal/privacy`, atteignable depuis le pied de page. Le scénario de suppression est rejouable avec `bun run db:test` (`supabase/tests/delete-account.test.sql`).

## Rétention des données

Un pseudo suffit à utiliser l'app, donc chaque pseudo crée un utilisateur anonyme : sans entretien, la base ne fait que grossir. Un job `pg_cron` nocturne (`public.run_maintenance()`) applique la rétention suivante :

| Donnée                             | Conservée | Puis                                               |
| ---------------------------------- | --------- | -------------------------------------------------- |
| Anonyme sans activité ni email lié | 90 jours  | supprimé, avec ses listes ; ses sessions survivent |
| Session `waiting` jamais lancée    | 7 jours   | supprimée                                          |
| Session `closed`                   | 180 jours | supprimée                                          |
| Essai de code raté                 | 24 heures | supprimé                                           |

Un compte reste **toujours** joignable donc **jamais** purgé dès qu'une adresse email lui est liée — même non confirmée —, ou un téléphone, ou une identité externe. Une session en cours protège aussi tous ses participants. Purger un compte n’efface jamais un classement : ses sessions restent, sans host et sans auteur (voir [Vie privée](#vie-privée)). Chaque passage journalise ses compteurs dans `public.maintenance_runs`. Détail et réglages dans [`docs/local-stack.md`](docs/local-stack.md#entretien).

## Déployer (Vercel + Supabase cloud)

1. Créer un projet Supabase, puis pousser le schéma : `supabase link --project-ref <ref>` et `supabase db push` (migrations, RLS, RPC, seed). Sans terminal sous la main, les mêmes opérations se pilotent depuis GitHub — voir [`docs/ci-database.md`](docs/ci-database.md).
2. Dans Supabase → Authentication → URL Configuration : ajouter `https://<domaine>/auth/confirm` aux _Redirect URLs_ (compte optionnel).
3. Dans Supabase → Database → Extensions : activer `pg_cron` si ce n'est pas déjà fait, puis rejouer les migrations de purge et de vote chronométré — sans l'extension elles s'appliquent quand même, mais leurs jobs ne sont pas planifiés (vérifier avec `select jobname, schedule from cron.job` : `omk-nightly-maintenance` et `omk-close-expired-sessions`).
4. Dans Vercel → Settings → Environment Variables (Production **et** Preview) :

| Variable                               | Valeur                                                    |
| -------------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL du projet (Project Settings → API)                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé _publishable_ (l'ancienne _anon_ est acceptée aussi)  |
| `NEXT_PUBLIC_SITE_URL`                 | optionnel — surcharge explicite (domaine personnalisé)    |
| `GOOGLE_PLACES_API_KEY`                | optionnel — active l'import Google (serveur uniquement)   |
| `NEXT_PUBLIC_POSTHOG_KEY`              | optionnel — sans elle, aucune mesure n'est chargée        |
| `NEXT_PUBLIC_POSTHOG_HOST`             | optionnel — `https://eu.i.posthog.com` par défaut         |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`       | optionnel — active le captcha de l'onboarding             |
| `TURNSTILE_SECRET_KEY`                 | optionnel — l'autre moitié du captcha (serveur seulement) |

L'URL publique (`env.SITE_URL`, côté serveur) est résolue dans cet ordre : `NEXT_PUBLIC_SITE_URL` si définie et non locale, sinon les variables système Vercel — `VERCEL_PROJECT_PRODUCTION_URL` en production, `VERCEL_BRANCH_URL` / `VERCEL_URL` en preview — et enfin `http://localhost:3000` en développement. Un `localhost` copié par erreur dans les variables Vercel est ignoré.

Le build échoue volontairement si `NEXT_PUBLIC_SUPABASE_URL` ou la clé manque (`src/env.ts`) : mieux vaut un build rouge qu'une app déployée qui ne parle à aucune base.

## Vie privée et mesure d'audience

- La mesure est **doublement conditionnée** : sans `NEXT_PUBLIC_POSTHOG_KEY`, le module est inerte ; sans consentement explicite, le script PostHog n'est même pas téléchargé — donc aucun cookie, aucun identifiant, aucune requête.
- Le bandeau propose « Refuser » et « Accepter » au même niveau, et le choix se révise depuis **Mon compte**.
- **Aucune donnée personnelle ne sort** : ni pseudo, ni email, ni nom de liste ou de restaurant. Les URL sont masquées avant envoi (`/sessions/[code]`, `/join/[code]`, `/l/[code]`, `/r/[code]`), car le code qu'elles portent suffirait à rejoindre une session, à lire une liste ou à ouvrir un classement. Le seul identifiant transmis est l'UUID opaque du profil.
- Le détail — catalogue d'événements, masquage, entonnoirs à construire — est dans [`docs/analytics.md`](docs/analytics.md).

## Versions et nouveautés

Deux journaux, deux publics.

| Journal                            | Pour qui          | Écrit par                       | Où on le lit                           |
| ---------------------------------- | ----------------- | ------------------------------- | -------------------------------------- |
| `CHANGELOG.md` + releases GitHub   | qui lit le code   | **généré** depuis les commits   | le dépôt                               |
| `src/content/changelog/entries.ts` | qui utilise l'app | **rédigé** après chaque release | `/nouveautes` et `/nouveautes/rss.xml` |

`commitlint` impose déjà les [Conventional Commits](https://www.conventionalcommits.org/fr/). À partir de là, tout s'enchaîne : à chaque push sur `main`, [release-please](https://github.com/googleapis/release-please) tient à jour une PR de release (version, `CHANGELOG.md`, `package.json`) ; la fusionner publie le tag `vX.Y.Z` et la release GitHub ; le workflow ouvre alors une issue de rédaction avec les commits déjà classés, pour écrire la note **produit**.

Cette dernière étape reste manuelle, et c'est voulu : `feat(routing): adresser les sessions par leur code court` est une phrase de développeur — l'utilisateur, lui, retient « le lien d'invitation tient en six caractères ». Aucun générateur ne fait cette traduction.

Côté site, les notes produit s'affichent sur **`/nouveautes`** (page prérendue, une carte par version), avec un flux **RSS**, un lien en pied de page et une **pastille dans l'en-tête** quand une version est parue depuis la dernière visite. Le repère de lecture est un simple numéro de version dans `localStorage` : rien n'est envoyé au serveur.

Le format d'une note, les règles d'écriture et les garde-fous vérifiés en CI sont dans [`docs/changelog.md`](docs/changelog.md).

## Roadmap

Les évolutions envisagées (filtres, anti-fatigue, notifications, PWA, i18n, RGPD…) sont suivies dans les [issues GitHub](https://github.com/AbderrahmaneMouzoune/onmangekoi/issues).

Leur classement par priorité et leur version cible (v1.1 → v2.0) sont dans [`docs/roadmap.md`](docs/roadmap.md).

## Hors scope (v1)

- Réservation / intégration TheFork, OpenTable
- Commentaires ou avis
