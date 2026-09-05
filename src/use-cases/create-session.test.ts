import { describe, expect, it, vi } from 'vitest'

import { AppError } from '@/domain/errors'

import { createSessionUseCase } from './create-session'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

const R1 = '11111111-1111-4111-8111-111111111111'
const R2 = '22222222-2222-4222-8222-222222222222'
const R3 = '33333333-3333-4333-8333-333333333333'
const L1 = '44444444-4444-4444-8444-444444444444'

function fakeClient(listRows: { restaurant_id: string; added_at: string }[]) {
  const rpc = vi.fn().mockResolvedValue({ data: { id: 's1', name: 'Lunch' }, error: null })
  const order = vi.fn().mockResolvedValue({ data: listRows, error: null })
  const inFn = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ in: inFn })
  const from = vi.fn().mockReturnValue({ select })
  return { client: { rpc, from } as unknown as SupabaseClient<Database>, rpc, from }
}

describe('createSessionUseCase', () => {
  it('should merge list restaurants and direct picks without duplicates, list first', async () => {
    const { client, rpc } = fakeClient([
      { restaurant_id: R1, added_at: '2026-01-01' },
      { restaurant_id: R2, added_at: '2026-01-02' },
    ])

    await createSessionUseCase(client, { name: 'Lunch', listIds: [L1], restaurantIds: [R2, R3] })

    expect(rpc).toHaveBeenCalledWith('create_session', {
      p_name: 'Lunch',
      p_restaurant_ids: [R1, R2, R3],
    })
  })

  it('should not query lists when none are selected', async () => {
    const { client, from } = fakeClient([])
    await createSessionUseCase(client, { name: 'Lunch', listIds: [], restaurantIds: [R1] })
    expect(from).not.toHaveBeenCalled()
  })

  it('should fail before the RPC when nothing resolves', async () => {
    const { client, rpc } = fakeClient([])
    await expect(
      createSessionUseCase(client, { name: 'Lunch', listIds: [L1], restaurantIds: [] })
    ).rejects.toBeInstanceOf(AppError)
    expect(rpc).not.toHaveBeenCalled()
  })
})
