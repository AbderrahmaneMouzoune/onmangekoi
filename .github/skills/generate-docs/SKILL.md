---
name: generate-docs
description: Génère ou améliore la documentation pour du code onmangekoi — commentaires, JSDoc léger, ou sections README
---

# Generate Docs

Génère la documentation appropriée pour le code fourni en respectant les standards du projet. Demande le fichier cible et le type de documentation si non précisés.

Demande les informations suivantes si non précisées :

- **Fichier ou fonction** à documenter
- **Type** : commentaires inline, README section, ou description de type/interface

## Requirements

- Les commentaires expliquent le **pourquoi**, pas le **quoi** — pas de redondance avec le code
- Documenter les contraintes métier non évidentes (ex : "1 superlike par participant par session")
- Pour les hooks : décrire leur comportement, leurs pré-conditions et leur valeur de retour
- Pour les Server Actions : indiquer si une authentification est requise
- Garder la documentation concise — éviter les blocs JSDoc exhaustifs sur du code auto-documenté
- Mettre à jour le `README.md` si de nouvelles variables d'environnement ou commandes sont ajoutées
