import { describe, expect, it, vi } from 'vitest'

import { deleteAccountUseCase } from './delete-account'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

function fakeClient(rpc: ReturnType<typeof vi.fn>, signOut = vi.fn().mockResolvedValue({})) {
  return {
    client: { rpc, auth: { signOut } } as unknown as SupabaseClient<Database>,
    signOut,
  }
}

describe('deleteAccountUseCase', () => {
  it('should delete the account in database then clear the session cookie', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const { client, signOut } = fakeClient(rpc)

    await deleteAccountUseCase(client)

    expect(rpc).toHaveBeenCalledWith('delete_my_account')
    expect(signOut).toHaveBeenCalled()
  })

  it('should keep the session when the deletion itself fails', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'omk:not_authenticated' } })
    const { client, signOut } = fakeClient(rpc)

    await expect(deleteAccountUseCase(client)).rejects.toMatchObject({
      message: 'omk:not_authenticated',
    })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('should not report a failed sign-out as a failed deletion', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    // Le compte auth n'existe plus : le serveur peut très bien refuser le
    // jeton. La suppression, elle, a bien eu lieu.
    const { client } = fakeClient(rpc, vi.fn().mockRejectedValue(new Error('network')))

    await expect(deleteAccountUseCase(client)).resolves.toBeUndefined()
  })
})
