import { describe, expect, it, vi } from 'vitest'

import { createListUseCase } from './create-list'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

const OWNER = '11111111-1111-4111-8111-111111111111'
const R1 = '22222222-2222-4222-8222-222222222222'
const R2 = '33333333-3333-4333-8333-333333333333'

function fakeClient() {
  const single = vi.fn().mockResolvedValue({ data: { id: 'l1', name: 'Bureau' }, error: null })
  const selectAfterInsert = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select: selectAfterInsert })
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ insert, upsert })
  return { client: { from } as unknown as SupabaseClient<Database>, insert, upsert }
}

describe('createListUseCase', () => {
  it('should create the list then fill it in one round-trip', async () => {
    const { client, insert, upsert } = fakeClient()

    const list = await createListUseCase(client, OWNER, {
      name: 'Bureau',
      restaurantIds: [R1, R2],
    })

    expect(insert).toHaveBeenCalledWith({ name: 'Bureau', owner_id: OWNER })
    expect(upsert).toHaveBeenCalledWith(
      [
        { list_id: 'l1', restaurant_id: R1 },
        { list_id: 'l1', restaurant_id: R2 },
      ],
      expect.anything()
    )
    expect(list).toMatchObject({ id: 'l1' })
  })

  it('should allow an empty list without a second write', async () => {
    const { client, upsert } = fakeClient()

    await createListUseCase(client, OWNER, { name: 'Bureau', restaurantIds: [] })

    expect(upsert).not.toHaveBeenCalled()
  })
})
