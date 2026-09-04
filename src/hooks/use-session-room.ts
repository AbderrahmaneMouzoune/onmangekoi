'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { getSessionById, getSessionParticipants } from '@/data-access/sessions'
import { createBrowserClient } from '@/data-access/supabase/client'

import type { ParticipantWithProfile, Session } from '@/data-access/models'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type ConnectionState = 'connecting' | 'live' | 'offline'

interface UseSessionRoomOptions {
  sessionId: string
  initialSession: Session
  initialParticipants: ParticipantWithProfile[]
}

/** Resynchronisation de secours quand le canal est en direct (filet, pas chemin principal). */
const LIVE_POLL_MS = 6000
/** Resynchronisation quand le canal est tombé. */
const OFFLINE_POLL_MS = 3000

/**
 * État live d'une session :
 *  - UPDATE sur `sessions` → statut (waiting → voting → closed)
 *  - tout événement sur `session_participants` → arrivées, départs, votes terminés
 *
 * Realtime est le chemin rapide ; un polling léger sert de filet dans tous les
 * cas (un événement manqué, un token appliqué tardivement, un canal qui se
 * croit ouvert). Le canal n'est ouvert qu'une fois le JWT de session posé sur
 * la connexion Realtime, sinon les événements sont filtrés par la RLS comme
 * pour un visiteur anonyme. Les lectures passent par la RLS.
 */
export function useSessionRoom({
  sessionId,
  initialSession,
  initialParticipants,
}: UseSessionRoomOptions) {
  const [session, setSession] = useState<Session>(initialSession)
  const [participants, setParticipants] = useState<ParticipantWithProfile[]>(initialParticipants)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const connectionRef = useRef<ConnectionState>('connecting')

  const refresh = useCallback(async () => {
    const supabase = createBrowserClient()
    try {
      const [nextSession, nextParticipants] = await Promise.all([
        getSessionById(supabase, sessionId),
        getSessionParticipants(supabase, sessionId),
      ])
      if (nextSession) setSession(nextSession)
      // Une liste vide signifie « rien de visible » (token absent) : on garde
      // l'état connu plutôt que d'effacer la salle.
      if (nextParticipants.length > 0) setParticipants(nextParticipants)
    } catch {
      // Réseau indisponible : on retentera au prochain événement / cycle
    }
  }, [sessionId])

  useEffect(() => {
    const supabase = createBrowserClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false

    const setConn = (state: ConnectionState) => {
      connectionRef.current = state
      setConnection(state)
    }

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
        .channel(`session:${sessionId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
          (payload) => {
            const next = payload.new as Partial<Session>
            setSession((prev) => ({ ...prev, ...next }))
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'session_participants',
            filter: `session_id=eq.${sessionId}`,
          },
          () => {
            void refresh()
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setConn('live')
            void refresh()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConn('offline')
          }
        })
    }

    void connect()

    const onWake = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onWake)
    window.addEventListener('focus', onWake)

    let timer = 0
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          void refresh().finally(schedule)
        },
        connectionRef.current === 'live' ? LIVE_POLL_MS : OFFLINE_POLL_MS
      )
    }
    schedule()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onWake)
      window.removeEventListener('focus', onWake)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [sessionId, refresh])

  return { session, participants, connection, refresh, setSession }
}
