// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GooglePlacesResults } from './google-places-results'

import type { PlaceResult } from '@/domain/places'

const importPlaceAction = vi.hoisted(() => vi.fn())
vi.mock('@/actions/places', () => ({ importPlaceAction }))

const SAKURA: PlaceResult = {
  placeId: 'ChIJsushi',
  name: 'Sushi Bar Sakura',
  address: '12 rue de la Paix, Paris',
  city: 'Paris',
  cuisineType: 'Japonais',
  priceLevel: 2,
  location: { lat: 48.853, lng: 2.3499 },
  rating: 4.5,
  ratingCount: 320,
  description: null,
  website: null,
  openingHours: null,
  photoName: null,
  photoUrl: null,
}

/** Opéra Garnier, Paris */
const OPERA = { lat: 48.8719, lng: 2.3316 }

const fetchMock = vi.fn()

describe('GooglePlacesResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [SAKURA] }) })
    vi.stubGlobal('fetch', fetchMock)
  })

  it('should illustrate each result with its budget, rating and address', async () => {
    render(<GooglePlacesResults query="sushi" position={null} onImported={vi.fn()} />)

    const card = await screen.findByRole('button', { name: 'Importer Sushi Bar Sakura' })
    expect(card).toHaveTextContent('Japonais')
    expect(card).toHaveTextContent('€€')
    expect(card).toHaveTextContent('4,5')
    expect(card).toHaveTextContent('(320)')
    expect(card).toHaveTextContent('12 rue de la Paix, Paris')
    expect(card).not.toHaveTextContent(/km/)
  })

  it('should send the position to bias the search and show the distance of each place', async () => {
    render(<GooglePlacesResults query="sushi" position={OPERA} onImported={vi.fn()} />)

    const card = await screen.findByRole('button', { name: 'Importer Sushi Bar Sakura' })
    expect(card).toHaveTextContent(/2,\d km/)
    expect(screen.getByText(/autour de toi/i)).toBeInTheDocument()

    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse(init.body)).toEqual({
      query: 'sushi',
      latitude: OPERA.lat,
      longitude: OPERA.lng,
    })
  })

  it('should import the place on click and hand the restaurant back', async () => {
    const imported = { id: 'uuid', name: 'Sushi Bar Sakura' }
    importPlaceAction.mockResolvedValue({ ok: true, data: imported })
    const onImported = vi.fn()
    render(<GooglePlacesResults query="sushi" position={null} onImported={onImported} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Importer Sushi Bar Sakura' }))

    await waitFor(() => expect(onImported).toHaveBeenCalledWith(imported))
    expect(importPlaceAction).toHaveBeenCalledWith('ChIJsushi')
  })

  it('should not search under two characters', () => {
    render(<GooglePlacesResults query="s" position={null} onImported={vi.fn()} />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/tape le nom d’un resto/i)).toBeInTheDocument()
  })
})
