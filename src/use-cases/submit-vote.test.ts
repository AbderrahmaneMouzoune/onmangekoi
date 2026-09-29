import { describe, expect, it, vi } from 'vitest'

import { submitVoteUseCase } from './submit-vote'

import type { Database } from '@/data-access/models/database'
import type { SubmitVoteInput } from '@/domain/schemas/vote'
import type { SupabaseClient } from '@supabase/supabase-js'

const USER = '11111111-1111-4111-8111-111111111111'
const INPUT: SubmitVoteInput = {
  sessionId: '22222222-2222-4222-8222-222222222222',
  sessionRestaurantId: '33333333-3333-4333-8333-333333333333',
  value: 1,
}

const VOTING = { status: 'voting', decided_restaurant_id: null, rules: {} }

function fakeClient(options: {
  rpcError?: unknown
  participant?: { data?: unknown; error?: unknown }
  /** La ligne de session relue après un « ça me va » */
  session?: { data?: unknown; error?: unknown }
}) {
  const rpc = vi.fn().mockResolvedValue({ error: options.rpcError ?? null })

  const participantSingle = vi
    .fn()
    .mockResolvedValue(options.participant ?? { data: { has_finished_voting: false }, error: null })
  const eqProfile = vi.fn().mockReturnValue({ maybeSingle: participantSingle })
  const eqSession = vi.fn().mockReturnValue({ eq: eqProfile })
  const participants = { select: vi.fn().mockReturnValue({ eq: eqSession }) }

  const sessionSingle = vi.fn().mockResolvedValue(options.session ?? { data: VOTING, error: null })
  const eqId = vi.fn().mockReturnValue({ maybeSingle: sessionSingle })
  const sessions = { select: vi.fn().mockReturnValue({ eq: eqId }) }

  const from = vi.fn((table: string) => (table === 'sessions' ? sessions : participants))
  return { client: { rpc, from } as unknown as SupabaseClient<Database>, rpc, from }
}

describe('submitVoteUseCase', () => {
  it('should record the vote and report the participant status', async () => {
    const { client, rpc } = fakeClient({ participant: { data: { has_finished_voting: true } } })

    await expect(submitVoteUseCase(client, USER, INPUT)).resolves.toEqual({
      recorded: true,
      finished: true,
      skipped: false,
      agreed: false,
    })
    expect(rpc).toHaveBeenCalledWith('submit_vote', {
      p_session_id: INPUT.sessionId,
      p_session_restaurant_id: INPUT.sessionRestaurantId,
      p_value: 1,
    })
  })

  it('should skip a restaurant already voted instead of failing', async () => {
    const { client } = fakeClient({ rpcError: { message: 'omk:already_voted' } })

    await expect(submitVoteUseCase(client, USER, INPUT)).resolves.toEqual({
      recorded: false,
      finished: false,
      skipped: true,
      agreed: false,
    })
  })

  it('should report a participant who already finished', async () => {
    const { client, from } = fakeClient({ rpcError: { message: 'omk:already_finished' } })

    await expect(submitVoteUseCase(client, USER, INPUT)).resolves.toEqual({
      recorded: false,
      finished: true,
      skipped: false,
      agreed: false,
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('should stop the deck when the session closed under its feet', async () => {
    // Avec un seuil de clôture sous 100 %, la session peut se fermer pendant
    // qu'on vote encore : c'est la fin du deck, pas une erreur à afficher.
    const { client, from } = fakeClient({ rpcError: { message: 'omk:session_not_voting' } })

    await expect(submitVoteUseCase(client, USER, INPUT)).resolves.toEqual({
      recorded: false,
      finished: true,
      skipped: false,
      agreed: false,
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('should propagate any other business error', async () => {
    const { client } = fakeClient({ rpcError: { message: 'omk:not_participant' } })

    await expect(submitVoteUseCase(client, USER, INPUT)).rejects.toMatchObject({
      message: 'omk:not_participant',
    })
  })

  it('should report the agreement a duo vote just sealed', async () => {
    const { client, from } = fakeClient({
      session: {
        data: {
          status: 'closed',
          decided_restaurant_id: '44444444-4444-4444-8444-444444444444',
          rules: { superlikes: 1, vetos: 1, close_at_ratio: 1, duo: true },
        },
        error: null,
      },
    })

    await expect(submitVoteUseCase(client, USER, INPUT)).resolves.toMatchObject({
      recorded: true,
      agreed: true,
    })
    expect(from).toHaveBeenCalledWith('sessions')
  })

  it('should not call a decided ordinary session an agreement', async () => {
    const { client } = fakeClient({
      session: {
        data: { status: 'closed', decided_restaurant_id: 'x', rules: { close_at_ratio: 1 } },
        error: null,
      },
    })

    await expect(submitVoteUseCase(client, USER, INPUT)).resolves.toMatchObject({ agreed: false })
  })

  it('should not read the session back after a « bof » or a veto', async () => {
    const { client, from } = fakeClient({})

    await submitVoteUseCase(client, USER, { ...INPUT, value: 0 })
    await submitVoteUseCase(client, USER, { ...INPUT, value: -2 })
    expect(from).not.toHaveBeenCalledWith('sessions')
  })

  it('should not invalidate a recorded vote when the status read fails', async () => {
    const { client } = fakeClient({
      participant: { error: { message: 'boom' } },
      session: { error: { message: 'boom' } },
    })

    await expect(submitVoteUseCase(client, USER, INPUT)).resolves.toEqual({
      recorded: true,
      finished: false,
      skipped: false,
      agreed: false,
    })
  })
})
