import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PATHS = ['/sessions', '/join']

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function redirectTo(request: NextRequest, supabaseResponse: NextResponse, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  const redirectResponse = NextResponse.redirect(url)
  // Propagate session cookies onto the redirect so the Server Component receives them
  supabaseResponse.cookies.getAll().forEach(({ name, value, ...options }) => {
    redirectResponse.cookies.set(name, value, options)
  })
  return redirectResponse
}

function redirectToSetup(request: NextRequest, supabaseResponse: NextResponse) {
  return redirectTo(request, supabaseResponse, '/setup')
}

/**
 * Garantit qu'un utilisateur Supabase existe pour chaque visiteur.
 * Si aucune session n'est trouvée, une session anonyme est créée automatiquement.
 * Pour les routes protégées, vérifie que le profil est configuré (pseudo != 'Anonyme').
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    await supabase.auth.signInAnonymously()
    if (isProtectedPath(request.nextUrl.pathname)) {
      return redirectToSetup(request, supabaseResponse)
    }
    return supabaseResponse
  }

  if (isProtectedPath(request.nextUrl.pathname)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('pseudo')
      .eq('id', user.id)
      .single()

    if (!profile || profile.pseudo === 'Anonyme') {
      return redirectToSetup(request, supabaseResponse)
    }
  }

  // Rediriger un utilisateur déjà configuré qui visite /setup
  if (request.nextUrl.pathname === '/setup') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('pseudo')
      .eq('id', user.id)
      .single()

    if (profile && profile.pseudo !== 'Anonyme') {
      return redirectTo(request, supabaseResponse, '/sessions/new')
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
