'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { getSessionById, getSessionParticipants } from '@/data-access/sessions'
import { createBrowserClient } from '@/data-access/supabase/client'

import type { ParticipantWithProfile, Session } from '@/data-access/models'

export type ConnectionState = 'connecting' | 'live' | 'offline'

interface UseSessionRoomOptions {
  sessionId: string
  initialSession: Session
  initialParticipants: ParticipantWithProfile[]
}

const OFFLINE_POLL_MS = 5000

/**
 * État live d'une session :
 *  - UPDATE sur `sessions` → statut (waiting → voting → closed)
 *  - tout événement sur `session_participants` → arrivées, départs, votes terminés
 * Se resynchronise au retour au premier plan et au retour du réseau, et bascule
 * en polling si le canal Realtime tombe. Les lectures passent par la RLS.
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
      setParticipants(nextParticipants)
    } catch {
      // Réseau indisponible : on retentera au prochain événement / cycle
    }
  }, [sessionId])

  useEffect(() => {
    const supabase = createBrowserClient()

    const setConn = (state: ConnectionState) => {
      connectionRef.current = state
      setConnection(state)
    }

    const channel = supabase
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

    const onWake = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onWake)
    window.addEventListener('focus', onWake)

    const poll = window.setInterval(() => {
      if (connectionRef.current !== 'live') void refresh()
    }, OFFLINE_POLL_MS)

    return () => {
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onWake)
      window.removeEventListener('focus', onWake)
      void supabase.removeChannel(channel)
    }
  }, [sessionId, refresh])

  return { session, participants, connection, refresh, setSession }
}
