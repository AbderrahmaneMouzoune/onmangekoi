---
name: code-review
description: Effectue une revue de code sur les changements ou fichiers fournis en suivant les standards onmangekoi
---

# Code Review

Effectue une revue de code structurée sur le code fourni en appliquant les standards du projet. Demande le fichier ou la PR si non précisé.

## Requirements

- Utiliser les niveaux de priorité définis dans `.github/instructions/code-review.instructions.md`
  - 🔴 CRITICAL : bloque le merge
  - 🟡 IMPORTANT : à discuter
  - 🟢 SUGGESTION : non bloquant
- Vérifier en priorité : sécurité (Server Actions protégées, validation Zod, pas de secrets), puis architecture, puis qualité
- Référencer les lignes exactes et proposer des corrections concrètes
- Reconnaître les bonnes pratiques — pas seulement signaler les problèmes
- Appliquer la checklist de `.github/instructions/code-review.instructions.md` avant de conclure
