# Lancer la stack en local

## Prérequis

- Docker Desktop démarré
- Bun installé
- Supabase CLI installé

## 1) Installer les dépendances

```bash
bun install
```

## 2) Configurer les variables d'environnement

Créer `.env.local` à partir de `.env.local.example`.

```bash
cp .env.local.example .env.local
```

## 3) Démarrer Supabase local

```bash
supabase start
```

Cette commande affiche les URLs locales et les clés (`anon key`, etc.).
Vérifie que `.env.local` contient les bonnes valeurs :

- `NEXT_PUBLIC_SUPABASE_URL` (souvent `http://127.0.0.1:54321`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 4) Lancer l'app Next.js

```bash
bun run dev
```

L'app démarre sur `http://localhost:3000`.

## Commandes utiles

- Réinitialiser la base locale et rejouer les migrations :

```bash
supabase db reset
```

- Arrêter la stack Supabase locale :

```bash
supabase stop
```

- Regénérer les types DB TypeScript depuis la DB locale :

```bash
supabase gen types typescript --local > src/data-access/models/database.ts
```
