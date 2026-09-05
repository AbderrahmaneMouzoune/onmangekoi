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

function fakeClient(options: {
  rpcError?: unknown
  participant?: { data?: unknown; error?: unknown }
}) {
  const rpc = vi.fn().mockResolvedValue({ error: options.rpcError ?? null })
  const maybeSingle = vi
    .fn()
    .mockResolvedValue(options.participant ?? { data: { has_finished_voting: false }, error: null })
  const eqProfile = vi.fn().mockReturnValue({ maybeSingle })
  const eqSession = vi.fn().mockReturnValue({ eq: eqProfile })
  const select = vi.fn().mockReturnValue({ eq: eqSession })
  const from = vi.fn().mockReturnValue({ select })
  return { client: { rpc, from } as unknown as SupabaseClient<Database>, rpc, from }
}

describe('submitVoteUseCase', () => {
  it('should record the vote and report the participant status', async () => {
    const { client, rpc } = fakeClient({ participant: { data: { has_finished_voting: true } } })

    await expect(submitVoteUseCase(client, USER, INPUT)).resolves.toEqual({
      recorded: true,
      finished: true,
      skipped: false,
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
    })
  })

  it('should report a participant who already finished', async () => {
    const { client, from } = fakeClient({ rpcError: { message: 'omk:already_finished' } })

    await expect(submitVoteUseCase(client, USER, INPUT)).resolves.toEqual({
      recorded: false,
      finished: true,
      skipped: false,
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('should propagate any other business error', async () => {
    const { client } = fakeClient({ rpcError: { message: 'omk:session_not_voting' } })

    await expect(submitVoteUseCase(client, USER, INPUT)).rejects.toMatchObject({
      message: 'omk:session_not_voting',
    })
  })

  it('should not invalidate a recorded vote when the status read fails', async () => {
    const { client } = fakeClient({ participant: { error: { message: 'boom' } } })

    await expect(submitVoteUseCase(client, USER, INPUT)).resolves.toEqual({
      recorded: true,
      finished: false,
      skipped: false,
    })
  })
})
