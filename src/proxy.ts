import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { router } from '@/config/router.config'
import { env } from '@/env'
import { isProtectedPath } from '@/lib/routing'

/**
 * Proxy Next.js (ex-middleware) :
 *  1. rafraîchit la session Supabase et propage les cookies (obligatoire pour
 *     que les Server Components lisent un token valide) ;
 *  2. sur les routes protégées, redirige vers l'onboarding si aucun
 *     utilisateur n'existe, en conservant la destination dans `?next=`.
 *
 * Il ne crée jamais d'utilisateur : l'utilisateur anonyme n'est créé qu'au
 * moment où la personne choisit son pseudo (action `setupProfileAction`).
 * L'autorisation réelle reste dans chaque Server Action / page.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims vérifie la signature du JWT (localement avec des clés
  // asymétriques, via le serveur Auth sinon) et déclenche le refresh si besoin.
  const { data } = await supabase.auth.getClaims()
  const isAuthenticated = Boolean(data?.claims?.sub)

  const { pathname, search } = request.nextUrl

  if (!isAuthenticated && isProtectedPath(pathname)) {
    const redirect = NextResponse.redirect(
      new URL(router.setup(`${pathname}${search}`), request.url)
    )
    response.cookies.getAll().forEach(({ name, value, ...options }) => {
      redirect.cookies.set(name, value, options)
    })
    return redirect
  }

  return response
}

/**
 * Next exige un littéral ici (analyse statique) : la liste doit couvrir
 * `PROTECTED_PREFIXES` de `config/router.config.ts` — un test unitaire
 * (`router.config.test.ts`) vérifie qu'ils restent alignés.
 */
export const config = {
  matcher: [
    '/setup',
    '/login',
    '/account/:path*',
    '/join/:path*',
    '/sessions/:path*',
    '/lists/:path*',
    '/l/:path*',
    '/auth/:path*',
  ],
}
