import { describe, expect, it, vi } from 'vitest'

import { AppError } from '@/domain/errors'

import { startSessionFromListUseCase } from './start-session-from-list'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

const CODE = 'H4V2Q8ZX0M'
const R1 = '11111111-1111-4111-8111-111111111111'
const R2 = '22222222-2222-4222-8222-222222222222'

interface Preview {
  name: string
}

function fakeClient(preview: Preview | null, restaurantIds: string[]) {
  const rpc = vi.fn().mockImplementation((name: string) => {
    if (name === 'list_by_share_token') {
      return Promise.resolve({ data: preview ? [preview] : [], error: null })
    }
    if (name === 'list_restaurants_by_share_token') {
      return Promise.resolve({ data: restaurantIds.map((id) => ({ id })), error: null })
    }
    return Promise.resolve({ data: { id: 's1', name: preview?.name }, error: null })
  })
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

describe('startSessionFromListUseCase', () => {
  it('should create a session named after the list, with all of its restaurants', async () => {
    const { client, rpc } = fakeClient({ name: 'Les restos du bureau' }, [R1, R2])

    const session = await startSessionFromListUseCase(client, CODE)

    expect(rpc).toHaveBeenCalledWith('create_session', {
      p_name: 'Les restos du bureau',
      p_restaurant_ids: [R1, R2],
    })
    expect(session).toEqual({ id: 's1', name: 'Les restos du bureau' })
  })

  it('should read the list through the share RPCs, never through the tables', async () => {
    const { client, rpc } = fakeClient({ name: 'Les restos du bureau' }, [R1])

    await startSessionFromListUseCase(client, CODE)

    // Celui qui clique n'est pas le propriétaire : la RLS ne lui montrerait
    // rien des tables `lists` et `list_restaurants`.
    expect(rpc).toHaveBeenCalledWith('list_by_share_token', { p_token: CODE })
    expect(rpc).toHaveBeenCalledWith('list_restaurants_by_share_token', { p_token: CODE })
  })

  it('should refuse a link that leads nowhere', async () => {
    const { client, rpc } = fakeClient(null, [])

    await expect(startSessionFromListUseCase(client, CODE)).rejects.toBeInstanceOf(AppError)
    expect(rpc).not.toHaveBeenCalledWith('create_session', expect.anything())
  })

  it('should refuse an empty list rather than open a session with nothing to vote on', async () => {
    const { client, rpc } = fakeClient({ name: 'Liste vide' }, [])

    await expect(startSessionFromListUseCase(client, CODE)).rejects.toBeInstanceOf(AppError)
    expect(rpc).not.toHaveBeenCalledWith('create_session', expect.anything())
  })

  it('should cut a name that would overflow what a session accepts', async () => {
    const { client, rpc } = fakeClient({ name: 'A'.repeat(140) }, [R1])

    await startSessionFromListUseCase(client, CODE)

    expect(rpc).toHaveBeenCalledWith('create_session', {
      p_name: 'A'.repeat(100),
      p_restaurant_ids: [R1],
    })
  })
})
