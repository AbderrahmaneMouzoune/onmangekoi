import { describe, expect, it, vi } from 'vitest'

import { AppError } from '@/domain/errors'

import { createSessionUseCase } from './create-session'

import type { Database } from '@/data-access/models/database'
import type { SupabaseClient } from '@supabase/supabase-js'

const R1 = '11111111-1111-4111-8111-111111111111'
const R2 = '22222222-2222-4222-8222-222222222222'
const R3 = '33333333-3333-4333-8333-333333333333'
const L1 = '44444444-4444-4444-8444-444444444444'
const G1 = '55555555-5555-4555-8555-555555555555'
const G2 = '66666666-6666-4666-8666-666666666666'

function fakeClient(
  listRows: { restaurant_id: string; added_at: string }[],
  recentWinners: { restaurant_id: string; last_won_at: string }[] = []
) {
  const rpc = vi
    .fn()
    .mockImplementation((name: string) =>
      name === 'recent_winners'
        ? Promise.resolve({ data: recentWinners, error: null })
        : Promise.resolve({ data: { id: 's1', name: 'Lunch' }, error: null })
    )
  const order = vi.fn().mockResolvedValue({ data: listRows, error: null })
  const inFn = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ in: inFn })
  const from = vi.fn().mockReturnValue({ select })
  return { client: { rpc, from } as unknown as SupabaseClient<Database>, rpc, from }
}

const WON_LAST_WEEK = '2026-09-11T11:30:00Z'

describe('createSessionUseCase', () => {
  it('should merge list restaurants and direct picks without duplicates, list first', async () => {
    const { client, rpc } = fakeClient([
      { restaurant_id: R1, added_at: '2026-01-01' },
      { restaurant_id: R2, added_at: '2026-01-02' },
    ])

    await createSessionUseCase(client, {
      name: 'Lunch',
      listIds: [L1],
      restaurantIds: [R2, R3],
      groupIds: [],
    })

    expect(rpc).toHaveBeenCalledWith('create_session', {
      p_name: 'Lunch',
      p_restaurant_ids: [R1, R2, R3],
    })
  })

  it('should not query lists when none are selected', async () => {
    const { client, from } = fakeClient([])
    await createSessionUseCase(client, {
      name: 'Lunch',
      listIds: [],
      restaurantIds: [R1],
      groupIds: [],
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('should date a duration on the given clock', async () => {
    const { client, rpc } = fakeClient([])
    const now = new Date('2026-09-07T10:00:00.000Z')

    await createSessionUseCase(
      client,
      { name: 'Lunch', listIds: [], restaurantIds: [R1], groupIds: [], closesInMinutes: 10 },
      now
    )

    expect(rpc).toHaveBeenCalledWith('create_session', {
      p_name: 'Lunch',
      p_restaurant_ids: [R1],
      p_closes_at: '2026-09-07T10:10:00.000Z',
    })
  })

  it('should pass an absolute deadline through untouched', async () => {
    const { client, rpc } = fakeClient([])

    await createSessionUseCase(client, {
      name: 'Lunch',
      listIds: [],
      restaurantIds: [R1],
      groupIds: [],
      closesAt: '2026-09-07T12:00:00.000Z',
    })

    expect(rpc).toHaveBeenCalledWith(
      'create_session',
      expect.objectContaining({ p_closes_at: '2026-09-07T12:00:00.000Z' })
    )
  })

  it('should say nothing about the deadline when there is none', async () => {
    const { client, rpc } = fakeClient([])
    await createSessionUseCase(client, {
      name: 'Lunch',
      listIds: [],
      restaurantIds: [R1],
      groupIds: [],
    })
    expect(rpc).toHaveBeenCalledWith('create_session', {
      p_name: 'Lunch',
      p_restaurant_ids: [R1],
    })
  })

  it('should carry custom rules to the RPC', async () => {
    const { client, rpc } = fakeClient([])

    await createSessionUseCase(client, {
      name: 'Lunch',
      listIds: [],
      restaurantIds: [R1],
      groupIds: [],
      vetos: 2,
      closeAtRatio: 0.8,
    })

    expect(rpc).toHaveBeenCalledWith('create_session', {
      p_name: 'Lunch',
      p_restaurant_ids: [R1],
      p_rules: { superlikes: 1, vetos: 2, close_at_ratio: 0.8 },
    })
  })

  it('should say nothing about the rules when they are the usual ones', async () => {
    const { client, rpc } = fakeClient([])

    await createSessionUseCase(client, {
      name: 'Lunch',
      listIds: [],
      restaurantIds: [R1],
      groupIds: [],
      superlikes: 1,
      vetos: 1,
      closeAtRatio: 1,
    })

    expect(rpc).toHaveBeenCalledWith('create_session', {
      p_name: 'Lunch',
      p_restaurant_ids: [R1],
    })
  })

  it('should invite the chosen groups once the session exists', async () => {
    const { client, rpc } = fakeClient([])

    await createSessionUseCase(client, {
      name: 'Lunch',
      listIds: [],
      restaurantIds: [R1],
      groupIds: [G1, G2],
    })

    expect(rpc).toHaveBeenNthCalledWith(1, 'create_session', expect.anything())
    expect(rpc).toHaveBeenNthCalledWith(2, 'invite_group_to_session', {
      p_group_id: G1,
      p_session_id: 's1',
    })
    expect(rpc).toHaveBeenNthCalledWith(3, 'invite_group_to_session', {
      p_group_id: G2,
      p_session_id: 's1',
    })
  })

  it('should keep the session when a group cannot be invited', async () => {
    const { client, rpc } = fakeClient([])
    rpc.mockImplementation(async (name: string) =>
      name === 'create_session'
        ? { data: { id: 's1', name: 'Lunch' }, error: null }
        : { data: null, error: { message: 'omk:group_not_found' } }
    )

    const session = await createSessionUseCase(client, {
      name: 'Lunch',
      listIds: [],
      restaurantIds: [R1],
      groupIds: [G1, G2],
    })

    // La session est créée : un groupe quitté entre-temps ne l'annule pas,
    // et le groupe suivant est quand même tenté.
    expect(session).toEqual({ id: 's1', name: 'Lunch' })
    expect(rpc).toHaveBeenCalledTimes(3)
  })

  it('should fail before the RPC when nothing resolves', async () => {
    const { client, rpc } = fakeClient([])
    await expect(
      createSessionUseCase(client, {
        name: 'Lunch',
        listIds: [L1],
        restaurantIds: [],
        groupIds: [],
      })
    ).rejects.toBeInstanceOf(AppError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('should ignore the recent winners when the anti-fatigue is off', async () => {
    const { client, rpc } = fakeClient([], [{ restaurant_id: R1, last_won_at: WON_LAST_WEEK }])

    await createSessionUseCase(client, {
      name: 'Lunch',
      listIds: [],
      restaurantIds: [R1, R2],
      groupIds: [],
    })

    expect(rpc).not.toHaveBeenCalledWith('recent_winners')
    expect(rpc).toHaveBeenCalledWith('create_session', {
      p_name: 'Lunch',
      p_restaurant_ids: [R1, R2],
    })
  })

  it('should drop a recent winner brought in by a list, not only a direct pick', async () => {
    const { client, rpc } = fakeClient(
      [{ restaurant_id: R1, added_at: '2026-01-01' }],
      [{ restaurant_id: R1, last_won_at: WON_LAST_WEEK }]
    )

    await createSessionUseCase(client, {
      name: 'Lunch',
      listIds: [L1],
      restaurantIds: [R2],
      groupIds: [],
      excludeRecentWinners: true,
    })

    expect(rpc).toHaveBeenCalledWith('create_session', {
      p_name: 'Lunch',
      p_restaurant_ids: [R2],
    })
  })

  it('should refuse rather than create an empty session when everything won lately', async () => {
    const { client, rpc } = fakeClient(
      [],
      [
        { restaurant_id: R1, last_won_at: WON_LAST_WEEK },
        { restaurant_id: R2, last_won_at: WON_LAST_WEEK },
      ]
    )

    await expect(
      createSessionUseCase(client, {
        name: 'Lunch',
        listIds: [],
        restaurantIds: [R1, R2],
        groupIds: [],
        excludeRecentWinners: true,
      })
    ).rejects.toBeInstanceOf(AppError)
    expect(rpc).not.toHaveBeenCalledWith('create_session', expect.anything())
  })
})
