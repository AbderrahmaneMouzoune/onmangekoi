'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { createBrowserClient } from '@/data-access/supabase/client'

import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Redemande le rendu serveur d'une page quand la ligne de session bouge.
 *
 * Rien n'est gardé côté client, contrairement à `useSessionRoom` : le
 * classement est rendu par le serveur, on se contente de le rejouer. Realtime
 * est le chemin rapide ; le retour au premier plan sert de filet quand le
 * canal n'a pas pu s'ouvrir. Le canal n'est ouvert qu'une fois le JWT posé sur
 * la connexion, sinon les événements sont filtrés par la RLS comme pour un
 * visiteur anonyme.
 */
export function useSessionWatch(sessionId: string, enabled = true) {
  const navigation = useRouter()

  useEffect(() => {
    if (!enabled) return

    const supabase = createBrowserClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false

    async function connect() {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (authSession?.access_token) {
        await supabase.realtime.setAuth(authSession.access_token)
      }
      if (cancelled) return

      channel = supabase
        .channel(`session-watch:${sessionId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
          () => navigation.refresh()
        )
        .subscribe()
    }

    void connect()

    const onWake = () => {
      if (document.visibilityState === 'visible') navigation.refresh()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onWake)
    window.addEventListener('focus', onWake)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onWake)
      window.removeEventListener('focus', onWake)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [sessionId, enabled, navigation])
}
