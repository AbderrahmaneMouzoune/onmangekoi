---
name: debug-issue
description: Débogue un problème dans onmangekoi de façon systématique — reproduire, analyser, corriger, vérifier
---

# Debug Issue

Résout les bugs de façon systématique en suivant un processus structuré. Demande la description du problème si non fournie.

Demande les informations suivantes si non précisées :

- **Description du problème** : comportement observé vs attendu
- **Étapes de reproduction** si connues
- **Messages d'erreur ou stack traces** disponibles

## Requirements

- Reproduire le bug avant de proposer un fix — ne pas deviner
- Analyser la cause racine (pas juste les symptômes) : traces de code, flux de données, état
- Proposer un fix ciblé et minimal — pas de refactoring non lié
- Vérifier que le fix ne cause pas de régression dans les flows critiques (vote, session, liste)
- Penser aux cas edge du domaine : utilisateur anonyme, session fermée, jokers épuisés
- Ajouter ou mettre à jour un test qui couvre le bug corrigé
- Résumer : cause racine + fix appliqué + mesures préventives si pertinentes
