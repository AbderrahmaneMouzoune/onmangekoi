// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AddRestaurantForm } from './add-restaurant-form'

import type { Restaurant } from '@/data-access/models'

const createRestaurantAction = vi.hoisted(() => vi.fn())
const findSimilarRestaurantsAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/restaurants', () => ({
  createRestaurantAction,
  findSimilarRestaurantsAction,
}))

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: crypto.randomUUID(),
    name: 'Le Petit Libanais',
    cuisine_type: null,
    address: null,
    city: null,
    description: null,
    photo_url: null,
    website: null,
    location: null,
    opening_hours: null,
    created_at: new Date().toISOString(),
    created_by: null,
    source: 'manual',
    price_level: null,
    place_id: null,
    ...overrides,
  }
}

describe('AddRestaurantForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findSimilarRestaurantsAction.mockResolvedValue({ ok: true, data: [] })
  })

  it('should prefill the name with what was being searched', () => {
    render(
      <AddRestaurantForm defaultName="Le petit libanais" onAdded={vi.fn()} onCancel={vi.fn()} />
    )
    expect(screen.getByLabelText(/nom du resto/i)).toHaveValue('Le petit libanais')
  })

  it('should keep the submit button disabled until the name is long enough', async () => {
    render(<AddRestaurantForm onAdded={vi.fn()} onCancel={vi.fn()} />)
    const submit = screen.getByRole('button', { name: /ajouter ce resto/i })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/nom du resto/i), 'A')
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/nom du resto/i), 'o')
    expect(submit).toBeEnabled()
  })

  it('should send the optional fields and hand the created restaurant back', async () => {
    const created = restaurant({ cuisine_type: 'Libanais', price_level: 2 })
    createRestaurantAction.mockResolvedValue({ ok: true, data: created })
    const onAdded = vi.fn()
    render(<AddRestaurantForm onAdded={onAdded} onCancel={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/nom du resto/i), 'Le Petit Libanais')
    await userEvent.type(screen.getByLabelText(/cuisine/i), 'Libanais')
    await userEvent.type(screen.getByLabelText(/adresse/i), '3 rue du Four')
    await userEvent.click(screen.getByRole('radio', { name: '€€' }))
    await userEvent.click(screen.getByRole('button', { name: /ajouter ce resto/i }))

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(created))
    expect(createRestaurantAction).toHaveBeenCalledWith({
      name: 'Le Petit Libanais',
      cuisineType: 'Libanais',
      address: '3 rue du Four',
      priceLevel: 2,
    })
  })

  it('should let the budget be unset by pressing the same level twice', async () => {
    createRestaurantAction.mockResolvedValue({ ok: true, data: restaurant() })
    render(<AddRestaurantForm defaultName="Wok Garden" onAdded={vi.fn()} onCancel={vi.fn()} />)

    await userEvent.click(screen.getByRole('radio', { name: '€€€' }))
    await userEvent.click(screen.getByRole('radio', { name: '€€€' }))
    await userEvent.click(screen.getByRole('button', { name: /ajouter ce resto/i }))

    await waitFor(() => expect(createRestaurantAction).toHaveBeenCalled())
    expect(createRestaurantAction.mock.calls[0]![0]).toMatchObject({ priceLevel: null })
  })

  it('should warn about a close name and let it be picked instead of creating a duplicate', async () => {
    const existing = restaurant({ name: 'Le Petit Libanais', source: 'seed' })
    findSimilarRestaurantsAction.mockResolvedValue({ ok: true, data: [existing] })
    const onAdded = vi.fn()
    render(
      <AddRestaurantForm defaultName="Le Petit Libanai" onAdded={onAdded} onCancel={vi.fn()} />
    )

    const suggestion = await screen.findByRole('button', { name: 'Le Petit Libanais' })
    expect(screen.getByText(/nom proche existe déjà/i)).toBeInTheDocument()

    await userEvent.click(suggestion)
    expect(onAdded).toHaveBeenCalledWith(existing)
    expect(createRestaurantAction).not.toHaveBeenCalled()
  })

  it('should surface the server error and stay open', async () => {
    createRestaurantAction.mockResolvedValue({
      ok: false,
      error: 'Tu dois d’abord choisir un pseudo.',
    })
    const onAdded = vi.fn()
    render(<AddRestaurantForm defaultName="Wok Garden" onAdded={onAdded} onCancel={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /ajouter ce resto/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Tu dois d’abord choisir un pseudo.')
    expect(onAdded).not.toHaveBeenCalled()
  })
})
