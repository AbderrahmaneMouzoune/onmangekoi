---

applyTo: "\*\*"
description: "Standards de sécurité OWASP pour onmangekoi — Next.js, Supabase"

---

# Sécurité — Standards et bonnes pratiques

Applique les conventions globales de `../copilot-instructions.md` à tout le code.

## Principes généraux

- Toute entrée utilisateur est non fiable jusqu'à validation Zod côté serveur
- Ne jamais exposer de stack traces ou d'informations internes en production
- Les secrets (clés API, `DATABASE_URL`, etc.) vivent uniquement dans `.env.local` — jamais dans le code
- Les variables préfixées `NEXT_PUBLIC_` sont exposées au client — ne jamais y mettre de secrets

## Authentification & Sessions

- Les tokens de session sont stockés en cookie `httpOnly; Secure; SameSite=Strict`
- Ne jamais stocker de tokens dans `localStorage` (vulnérable au XSS)
- Les Server Actions sensibles vérifient la session en premier, avant toute logique
- Limiter les tentatives de connexion (rate limiting sur les endpoints d'auth)

## Autorisation

- Vérifier la propriété des ressources côté serveur avant tout accès (prévenir l'IDOR)
- Les gardes frontend sont UX uniquement — l'autorisation réelle se fait toujours côté serveur
- Les Server Actions exposent uniquement les champs nécessaires — pas de mass assignment via `...req.body`

## Injection & XSS

- Utiliser le client Supabase avec des requêtes paramétrées — jamais de string interpolation dans les queries SQL
- Ne jamais utiliser `dangerouslySetInnerHTML` avec du contenu non sanitisé
- Valider et assainir tout contenu utilisateur avant rendu HTML

## Next.js spécifique

- Protéger les Server Actions avec une vérification d'authentification explicite
- Le `middleware.ts` couvre `/api/` et les routes protégées
- Ne jamais sérialiser des objets DB complets vers les Client Components (choisir uniquement les champs nécessaires)
- Utiliser `NEXT_PUBLIC_` uniquement pour les URLs publiques non sensibles

## Dépendances

- Lancer `npm audit` régulièrement et traiter les vulnérabilités critiques immédiatement
- Committer le lockfile (`package-lock.json`) et utiliser `npm ci` en CI
- Vérifier les nouvelles dépendances avant installation (typosquatting, scripts postinstall)
