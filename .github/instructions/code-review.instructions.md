---

applyTo: "\*\*"
description: "Standards de code review pour onmangekoi"
excludeAgent: ["coding-agent"]

---

# Code Review — Standards et priorités

Applique les conventions globales de `../copilot-instructions.md` à tout le code.

## Niveaux de priorité

- **🔴 CRITICAL** (bloque le merge) : vulnérabilités de sécurité, logique incorrecte, perte de données, secrets exposés
- **🟡 IMPORTANT** (discussion requise) : couverture de tests manquante, violations d'architecture, performance évidente
- **🟢 SUGGESTION** (non bloquant) : lisibilité, naming, optimisations mineures

## Critères de revue

### Qualité du code

- Les noms sont descriptifs et suivent les conventions du projet (`kebab-case` composants, `kebab-case` hooks/utils)
- Fonctions petites et focalisées — un seul niveau d'abstraction par fonction
- Pas de duplication — factoriser la logique commune dans `lib/`
- Pas de `any` TypeScript sans justification

### Sécurité

- Les Server Actions vérifient l'authentification/autorisation en premier
- Toutes les entrées sont validées avec Zod côté serveur
- Pas de secrets dans le code ni dans les logs
- Vérification de propriété des ressources (anti-IDOR)

### Tests

- Les nouvelles fonctionnalités critiques ont des tests
- Les edge cases et les erreurs sont couverts
- Les tests sont déterministes et indépendants

### Architecture

- Suit la structure établie du projet (`lib/`, `components/[feature]/`, `lib/actions/`)
- Les Server Components ne contiennent pas de logique client
- Les Server Actions n'exposent pas plus que nécessaire

### Performance

- Pas de `useEffect` + `fetch` pour du contenu principal (utiliser Server Components)
- `next/image` pour toutes les images
- Pas de `'use client'` inutile sur des composants sans état/interactivité

## Format des commentaires

```markdown
**[PRIORITÉ] Catégorie : Titre court**

Description du problème.

**Pourquoi c'est important :**
Explication de l'impact.

**Correction suggérée :**
[exemple de code si applicable]
```

## Checklist avant merge

- [ ] Pas de secrets ou de données sensibles dans le code
- [ ] Inputs validés côté serveur avec Zod
- [ ] Server Actions protégées par vérification d'authentification
- [ ] Nouveaux composants suivent la structure du projet
- [ ] `next/image` utilisé pour toutes les images
- [ ] Pas de `console.log` de debug laissé dans le code
- [ ] Types TypeScript corrects — pas de `any` non justifié
