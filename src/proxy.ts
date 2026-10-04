import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'

import { router } from '@/config/router.config'
import { env } from '@/env'
import { routing } from '@/i18n/routing'
import { isProtectedPath, needsSessionRefresh } from '@/lib/routing'

import type { CookieOptions } from '@supabase/ssr'

const handleI18nRouting = createIntlMiddleware(routing)

/**
 * Proxy Next.js (ex-middleware) :
 *  1. sur les routes qui lisent l'utilisateur (`SESSION_REFRESH_PREFIXES`),
 *     rafraîchit la session Supabase et propage les cookies (obligatoire pour
 *     que les Server Components lisent un token valide) ;
 *  2. sur les routes protégées, redirige vers l'onboarding si aucun
 *     utilisateur n'existe, en conservant la destination dans `?next=` ;
 *  3. partout, choisit la langue (cookie `NEXT_LOCALE`, sinon
 *     `Accept-Language`) et réécrit la requête vers le segment caché
 *     `app/[locale]/…` — l'URL visible ne change pas (voir `i18n/routing.ts`).
 *
 * Il ne crée jamais d'utilisateur : l'utilisateur anonyme n'est créé qu'au
 * moment où la personne choisit son pseudo (action `setupProfileAction`).
 * L'autorisation réelle reste dans chaque Server Action / page.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const refreshed: { name: string; value: string; options: CookieOptions }[] = []

  if (needsSessionRefresh(pathname)) {
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            // Écrits sur la requête, ils atteignent les Server Components de
            // ce rendu (next-intl recopie ses en-têtes) ; retenus pour la
            // réponse, ils atteignent le navigateur.
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            refreshed.push(...cookiesToSet)
          },
        },
      }
    )

    // getClaims vérifie la signature du JWT (localement avec des clés
    // asymétriques, via le serveur Auth sinon) et déclenche le refresh si besoin.
    const { data } = await supabase.auth.getClaims()
    const isAuthenticated = Boolean(data?.claims?.sub)

    if (!isAuthenticated && isProtectedPath(pathname)) {
      const redirect = NextResponse.redirect(
        new URL(router.setup(`${pathname}${search}`), request.url)
      )
      refreshed.forEach(({ name, value, options }) => redirect.cookies.set(name, value, options))
      return redirect
    }
  }

  const response = handleI18nRouting(request)
  refreshed.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  return response
}

/**
 * Toutes les pages passent par le proxy, puisque toutes vivent sous
 * `app/[locale]`. En sont exclus : les routes d'API, les fichiers de Next, les
 * icônes, le service worker, les images Open Graph (leur URL porte déjà la
 * langue, `/<langue>/…/opengraph-image`) et les fichiers statiques — sauf le
 * manifest, traduit lui aussi.
 *
 * Le rafraîchissement de la session Supabase, lui, ne concerne que
 * `SESSION_REFRESH_PREFIXES` (`lib/routing.ts`), qui couvre les préfixes
 * protégés — un test unitaire vérifie qu'ils restent alignés.
 */
export const config = {
  matcher: [
    '/((?!api/|_next/|_vercel/|icons/|icon|apple-icon|sw\\.js|.*opengraph-image|.*\\.(?:ico|png|jpe?g|gif|svg|webp|avif|txt|xml|js|map|json|webmanifest|woff2?)$).*)',
    '/manifest.webmanifest',
  ],
}
