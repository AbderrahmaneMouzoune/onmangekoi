'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { createBrowserClient } from '@/data-access/supabase'

import type { SessionStatus } from '@/data-access/models/database'
import type { ParticipantWithProfile } from '@/data-access/sessions'

interface UseWaitingRoomOptions {
  sessionId: string
  initialParticipants: ParticipantWithProfile[]
  initialStatus: SessionStatus
}

/**
 * Abonnement Supabase Realtime (Postgres Changes) pour la salle d'attente.
 * - INSERT sur session_participants → re-fetch la liste complète
 * - UPDATE sur sessions → met à jour le statut de la session
 * Nettoie le channel automatiquement au démontage.
 */
export function useWaitingRoom({
  sessionId,
  initialParticipants,
  initialStatus,
}: UseWaitingRoomOptions) {
  const [participants, setParticipants] = useState(initialParticipants)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(initialStatus)

  const supabase = useMemo(() => createBrowserClient(), [])

  const refreshParticipants = useCallback(async () => {
    const { data } = await supabase
      .from('session_participants')
      .select('*, profiles(id, pseudo)')
      .eq('session_id', sessionId)
      .order('joined_at', { ascending: true })
    if (data) setParticipants(data as ParticipantWithProfile[])
  }, [supabase, sessionId])

  useEffect(() => {
    const channel = supabase
      .channel(`waiting-room-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_participants',
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          refreshParticipants()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const updated = payload.new as { status: SessionStatus }
          setSessionStatus(updated.status)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, sessionId, refreshParticipants])

  return { participants, sessionStatus }
}
