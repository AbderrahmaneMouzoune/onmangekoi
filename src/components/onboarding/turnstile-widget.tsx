'use client'

import { useEffect, useRef, useState } from 'react'

import { env } from '@/env'
import { TURNSTILE_FIELD, TURNSTILE_SCRIPT_SRC } from '@/lib/turnstile'

/**
 * Captcha Cloudflare Turnstile, en mode `interaction-only` : invisible tant
 * que Cloudflare ne demande rien, une case à cocher seulement pour les
 * visiteurs jugés douteux. Le jeton part dans le formulaire sous le nom
 * attendu par l'API de vérification (`TURNSTILE_FIELD`).
 *
 * Sans `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, le composant ne rend rien et ne
 * télécharge aucun script : c'est l'état des tests e2e et du développement
 * local, où `verifyTurnstile` laisse passer de son côté.
 */

interface TurnstileOptions {
  sitekey: string
  action?: string
  appearance?: 'always' | 'execute' | 'interaction-only'
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileOptions) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/** Le script est partagé par toutes les instances : une seule balise, un seul chargement. */
let loader: Promise<TurnstileApi | null> | null = null

function loadTurnstile(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loader ??= new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve(window.turnstile ?? null))
    script.addEventListener('error', () => {
      // Script bloqué (extension, réseau) : on relâche le verrou pour qu'un
      // remontage puisse retenter, et le serveur tranchera.
      loader = null
      resolve(null)
    })
    document.head.append(script)
  })
  return loader
}

interface TurnstileWidgetProps {
  /** Étiquette envoyée à Cloudflare, utile pour lire ses statistiques par formulaire. */
  action?: string
  /**
   * Change à chaque retour du serveur : un jeton est à usage unique, il faut
   * en redemander un avant la tentative suivante.
   */
  resetKey?: unknown
}

export function TurnstileWidget({ action, resetKey }: TurnstileWidgetProps) {
  const siteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const [token, setToken] = useState('')

  useEffect(() => {
    if (!siteKey) return
    let mounted = true

    void loadTurnstile().then((turnstile) => {
      if (!mounted || !turnstile || !containerRef.current) return
      widgetId.current = turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        appearance: 'interaction-only',
        callback: setToken,
        'expired-callback': () => setToken(''),
        'error-callback': () => setToken(''),
      })
    })

    return () => {
      mounted = false
      const id = widgetId.current
      widgetId.current = null
      if (id) window.turnstile?.remove(id)
    }
  }, [siteKey, action])

  useEffect(() => {
    if (!resetKey || !widgetId.current) return
    window.turnstile?.reset(widgetId.current)
    setToken('')
  }, [resetKey])

  if (!siteKey) return null

  return (
    <>
      <input type="hidden" name={TURNSTILE_FIELD} value={token} />
      <div ref={containerRef} className="empty:hidden" />
    </>
  )
}
