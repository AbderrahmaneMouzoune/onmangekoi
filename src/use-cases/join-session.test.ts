import { describe, expect, it, vi } from 'vitest'

import { AppError } from '@/domain/errors'

import { joinSessionUseCase } from './join-session'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

const TOKEN = 'a3f9b2c4d5e6f7a8b9c0d1e2f3a4b5c6'

function fakeClient(rpcResult: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

describe('joinSessionUseCase', () => {
  it('should normalize a lowercase code before calling the RPC', async () => {
    const { client, rpc } = fakeClient({ data: { id: 's1' } })
    const session = await joinSessionUseCase(client, ' a3f 9b2 ')
    expect(rpc).toHaveBeenCalledWith('join_session', { p_identifier: 'A3F9B2' })
    expect(session).toEqual({ id: 's1' })
  })

  it('should extract the token from a pasted invite link', async () => {
    const { client, rpc } = fakeClient({ data: { id: 's1' } })
    await joinSessionUseCase(client, `https://onmangekoi.app/join/${TOKEN}`)
    expect(rpc).toHaveBeenCalledWith('join_session', { p_identifier: TOKEN })
  })

  it('should reject malformed input without hitting the database', async () => {
    const { client, rpc } = fakeClient({ data: null })
    await expect(joinSessionUseCase(client, 'nope')).rejects.toBeInstanceOf(AppError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('should propagate database business errors', async () => {
    const { client } = fakeClient({ error: { message: 'omk:session_started' } })
    await expect(joinSessionUseCase(client, 'A3F9B2')).rejects.toMatchObject({
      message: 'omk:session_started',
    })
  })
})
