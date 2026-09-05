import { describe, expect, it, vi } from 'vitest'

import { updatePseudoUseCase } from './update-pseudo'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

const USER = '11111111-1111-4111-8111-111111111111'

function fakeClient() {
  const eq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ update })
  const updateUser = vi.fn().mockResolvedValue({ error: null })
  return {
    client: { from, auth: { updateUser } } as unknown as SupabaseClient<Database>,
    update,
    eq,
    updateUser,
  }
}

describe('updatePseudoUseCase', () => {
  it('should keep the profile row and the auth metadata in sync', async () => {
    const { client, update, eq, updateUser } = fakeClient()

    await updatePseudoUseCase(client, USER, 'Zoé')

    expect(update).toHaveBeenCalledWith({ pseudo: 'Zoé' })
    expect(eq).toHaveBeenCalledWith('id', USER)
    expect(updateUser).toHaveBeenCalledWith({ data: { pseudo: 'Zoé' } })
  })
})
