# 🍴 onmangekoi — MVP

> Voter où manger avec ses collègues et amis, sans perdre 10 minutes à "je sais pas, comme tu veux".

---

## Le problème

Décider où manger en groupe prend trop de temps. Chacun dit "peu importe" mais a un avis. Le groupe tourne en rond entre les mêmes options connues. onmangekoi transforme cette décision en 2 minutes.

---

## Le principe

1. Tu crées une **liste** de restaurants favoris (ex : "Restos du bureau") — sans créer de compte
2. Tu lances une **session de vote**, tu importes ta liste, tu invites le groupe via un lien
3. Chacun vote dans son coin, **style Tinder** : dislike / like / superlike / super dislike
4. Quand tout le monde a voté, le **classement** s'affiche
5. Le groupe sait où aller.

---

## Principe fondamental : zéro friction d'inscription

**Tout le produit est utilisable sans créer de compte.**

À la première visite, l'utilisateur saisit simplement un **pseudo** — c'est la seule action requise. Ce pseudo est réutilisé automatiquement sur les visites suivantes et reste modifiable à tout moment.

La création de compte est optionnelle et sert uniquement à **retrouver ses listes depuis un autre appareil**.

| Action                                     | Sans compte | Avec compte |
| ------------------------------------------ | ----------- | ----------- |
| Créer une liste                            | ✅          | ✅          |
| Partager une liste                         | ✅          | ✅          |
| Créer une session                          | ✅          | ✅          |
| Rejoindre une session                      | ✅          | ✅          |
| Retrouver ses listes sur un autre appareil | ❌          | ✅          |

---

## MVP — Périmètre

### Ce qu'on construit

| Fonctionnalité      | Description                                                                          |
| ------------------- | ------------------------------------------------------------------------------------ |
| Identité anonyme    | Pseudo saisi à la première visite, persisté et réutilisé automatiquement, modifiable |
| Compte optionnel    | Email / mot de passe pour retrouver ses listes sur d'autres appareils                |
| Base de restaurants | Base statique en v1 — extensible par ajout manuel ou import via API                  |
| Listes de favoris   | Créer, nommer, éditer des listes de restaurants, accessibles par lien                |
| Partage de listes   | Lien de partage : lecture seule ou collaboratif                                      |
| Création de session | Nom de session, import d'une ou plusieurs listes, lien d'invitation                  |
| Vote                | Interface carte par carte — 4 actions : dislike / like / superlike / super dislike   |
| Jokers              | 1 superlike ET 1 super dislike disponibles par participant par session               |
| Session live        | Le host lance le vote, suit qui a terminé en temps réel                              |
| Clôture forcée      | Le host peut clôturer même si certains participants n'ont pas fini                   |
| Résultats           | Classement des restaurants avec score agrégé                                         |

### Ce qu'on ne construit PAS (v1)

- Réservation / intégration TheFork, OpenTable
- Anti-fatigue (détection des restaurants récurrents)
- Notifications push
- Commentaires ou reviews sur les restaurants
- Filtres (régime, distance, budget)
- Historique des sessions / statistiques
- Découverte de nouveaux restaurants

---

## Les restaurants

### Base statique (v1)

Au lancement, onmangekoi s'appuie sur une **base de restaurants pré-chargée**. Les utilisateurs choisissent parmi ces restaurants pour construire leurs listes.

### Ajout de restaurants (roadmap)

Deux modes d'extension sont prévus pour les versions suivantes :

**Ajout manuel** — Un utilisateur peut soumettre un restaurant (nom, adresse, type de cuisine). Le restaurant est ajouté à la base globale et disponible pour tous.

**Import via API** — Connexion à Google Places pour enrichir la base automatiquement à partir d'une recherche ou d'une zone géographique. Le restaurant est enregistré localement à la première fois qu'il est sélectionné.

---

## Système de vote

Chaque participant dispose de **4 actions** pour voter sur chaque restaurant :

| Action        | Valeur | Contrainte             |
| ------------- | ------ | ---------------------- |
| Dislike       | 0      | Illimité               |
| Like          | +1     | Illimité               |
| Superlike     | +2     | **1 seul par session** |
| Super dislike | -2     | **1 seul par session** |

Le superlike et le super dislike sont des **jokers** : chaque participant en dispose d'un de chaque pour toute la session. Ils permettent d'exprimer une préférence forte ou un veto.

### Calcul du classement

```
Score(restaurant) = Σ des votes de tous les participants
```

Les restaurants sans vote comptent 0. En cas d'égalité, le nombre de superlikes départage.

---

## Flows utilisateur

### Flow 1 — Première visite

```
Arriver sur l'app → Saisir un pseudo → Accéder à toutes les fonctionnalités
(Le pseudo est mémorisé et réutilisé automatiquement)
```

### Flow 2 — Créer et gérer ses listes

```
"Nouvelle liste" → Nommer la liste
→ Chercher un restaurant dans la base → L'ajouter
→ Partager le lien de la liste (optionnel)
```

### Flow 3 — Lancer une session

```
"Nouvelle session" → Nommer la session → Importer une ou plusieurs listes
→ Copier le lien d'invitation → Envoyer au groupe
→ Attendre que tout le monde rejoigne (salle d'attente)
→ Lancer le vote
```

### Flow 4 — Voter (participant)

```txt
Ouvrir le lien → (Saisir son pseudo si première visite) → Rejoindre la session
→ Attendre le lancement par le host
→ Voir les cartes une par une → Voter
→ Utiliser son superlike ou super dislike au bon moment
→ Écran d'attente une fois tous les restaurants votés
→ Voir le classement final à la clôture
```

### Flow 5 — Suivre et clôturer (host)

```txt
Vue host : liste des participants + avancement en temps réel (X/Y ont terminé)
→ Clôture automatique quand tout le monde a voté
   OU clôture manuelle par le host à tout moment
→ Classement final affiché à tous les participants
```

---

## Règles de session

| Règle               | Comportement                                                                            |
| ------------------- | --------------------------------------------------------------------------------------- |
| Snapshot            | Les restaurants sont figés au lancement — pas d'ajout en cours de session               |
| Votes privés        | Personne ne voit les votes des autres pendant la session                                |
| Clôture automatique | Déclenchée dès que 100% des participants ont terminé de voter                           |
| Clôture forcée      | Le host peut clôturer à tout moment — les votes manquants comptent 0                    |
| Vue host            | Affiche en temps réel quels participants ont terminé (statut uniquement, pas les votes) |
| Jokers              | 1 superlike + 1 super dislike par participant par session — non cumulables              |

---

## Stack technique

| Couche          | Choix                                                                |
| --------------- | -------------------------------------------------------------------- |
| Frontend        | Next.js (React) — mobile-first                                       |
| Backend         | Next.js API Routes                                                   |
| ORM             | Prisma                                                               |
| Base de données | PostgreSQL                                                           |
| Temps réel      | Supabase Realtime (avancement des votes en live)                     |
| Auth            | Sessions anonymes via cookie + compte optionnel (email/mot de passe) |
| Déploiement     | Vercel + Supabase                                                    |

---

## Roadmap MVP — 3 sprints

### Sprint 1 — Fondations

- Identité anonyme (pseudo + cookie)
- Base de restaurants statique
- Création et gestion de listes avec lien de partage

### Sprint 2 — Sessions

- Création de session avec import de listes et snapshot
- Lien d'invitation
- Interface de vote (swipe) avec gestion des jokers
- Temps réel : avancement des participants via Supabase Realtime

### Sprint 3 — Résultats & polish

- Classement final avec calcul des scores
- Clôture automatique + clôture forcée par le host
- UI mobile responsive et fluide
- Compte optionnel (email/mot de passe) pour persistance cross-device
- Tests e2e du flow complet

---

## Hors scope explicite (décisions prises)

- **Anti-fatigue** : le produit ne gère pas le cas "même restaurant 3x cette semaine"
- **Réservation** : onmangekoi s'arrête à la décision, pas à l'action
- **Filtres** : pas de filtre par régime alimentaire, distance ou prix en v1
- **Import API restaurants** : prévu en roadmap, pas dans le MVP
- **Compte obligatoire** : tout est utilisable en anonyme — le compte ne sert qu'à la persistance cross-device

---
