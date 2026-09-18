// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RestaurantPicker } from './restaurant-picker'
import { RestaurantSourcesProvider } from './restaurant-sources'

import type { ListWithRestaurantIds } from '@/data-access/lists'
import type { Restaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'
import type { PlaceResult } from '@/domain/places'

const searchRestaurantsAction = vi.hoisted(() => vi.fn())
const createRestaurantAction = vi.hoisted(() => vi.fn())
const findSimilarRestaurantsAction = vi.hoisted(() => vi.fn())
const importPlaceAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/restaurants', () => ({
  searchRestaurantsAction,
  createRestaurantAction,
  findSimilarRestaurantsAction,
}))
vi.mock('@/actions/places', () => ({ importPlaceAction }))

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: crypto.randomUUID(),
    name: 'Chez Marcel',
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
    source: 'seed',
    price_level: null,
    place_id: null,
    ...overrides,
  }
}

function list(overrides: Partial<ListWithRestaurantIds> = {}): ListWithRestaurantIds {
  return {
    id: crypto.randomUUID(),
    name: 'Restos du bureau',
    owner_id: crypto.randomUUID(),
    share_code: 'ABCDEFGHJK',
    share_token: 'a'.repeat(32),
    is_collaborative: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    restaurant_ids: [],
    ...overrides,
  }
}

const MARCEL = restaurant({ name: 'Chez Marcel', cuisine_type: 'Français' })
const SAKURA = restaurant({ name: 'Sakura', cuisine_type: 'Japonais' })
const WOK = restaurant({ name: 'Wok Garden', cuisine_type: 'Chinois' })
const PAGE: RestaurantPage = { items: [MARCEL, SAKURA, WOK], hasMore: false, nextOffset: 3 }

/** Opéra Garnier, Paris */
const OPERA = { latitude: 48.8719, longitude: 2.3316 }

/** À ~320 m au sud de l'Opéra. */
const SUSHI_PLACE: PlaceResult = {
  placeId: 'ChIJsushi',
  name: 'Sushi Bar Sakura',
  address: '12 rue de la Paix, Paris',
  city: 'Paris',
  cuisineType: 'Japonais',
  priceLevel: 2,
  location: { lat: 48.869, lng: 2.3316 },
  description: null,
  website: null,
  openingHours: null,
  photoName: null,
  photoUrl: null,
}

const RAMEN_PLACE: PlaceResult = {
  ...SUSHI_PLACE,
  placeId: 'ChIJramen',
  name: 'Ramen Ichiban',
  address: '4 rue Sainte-Anne, Paris',
  location: { lat: 48.866, lng: 2.335 },
}

const getCurrentPosition = vi.fn()
const fetchMock = vi.fn()

function grantPosition() {
  getCurrentPosition.mockImplementation((onSuccess: PositionCallback) =>
    onSuccess({ coords: OPERA } as GeolocationPosition)
  )
}

function refusePosition() {
  getCurrentPosition.mockImplementation(
    (_onSuccess: PositionCallback, onError?: PositionErrorCallback) =>
      onError?.({ code: 1, message: 'User denied Geolocation' } as GeolocationPositionError)
  )
}

function googleAnswers(results: PlaceResult[]) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results }) })
}

/** Le sélecteur est contrôlé : le harnais tient la sélection, comme un formulaire. */
function Harness({
  lists = [],
  google = true,
  onChange = () => {},
}: {
  lists?: ListWithRestaurantIds[]
  google?: boolean
  onChange?: (ids: string[]) => void
}) {
  const [value, setValue] = useState<string[]>([])
  const [listIds, setListIds] = useState<string[]>([])
  return (
    <RestaurantSourcesProvider google={google}>
      <RestaurantPicker
        initialPage={PAGE}
        value={value}
        onChange={(ids) => {
          setValue(ids)
          onChange(ids)
        }}
        inputName="restaurantIds"
        lists={lists}
        selectedListIds={listIds}
        onListsChange={setListIds}
        listsInputName="listIds"
      />
    </RestaurantSourcesProvider>
  )
}

function hiddenValues(name: string): string[] {
  return [
    ...document.querySelectorAll<HTMLInputElement>(`input[type="hidden"][name="${name}"]`),
  ].map((input) => input.value)
}

describe('RestaurantPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    })
    findSimilarRestaurantsAction.mockResolvedValue({ ok: true, data: [] })
    searchRestaurantsAction.mockResolvedValue({ ok: true, data: PAGE })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should put my lists, the address book and Google side by side, opening on my lists', () => {
    render(<Harness lists={[list({ restaurant_ids: [MARCEL.id] })]} />)

    const tabs = within(
      screen.getByRole('tablist', { name: 'Source des restaurants' })
    ).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Mes listes', 'Le carnet', 'Google'])
    expect(screen.getByRole('tab', { name: 'Mes listes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('list', { name: 'Mes listes' })).toBeInTheDocument()
  })

  it('should drop the list source without lists, and the rail without a second source', () => {
    render(<Harness google={false} />)

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Mes listes' })).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Résultats' })).toBeInTheDocument()
  })

  it('should mix a whole list with restaurants picked one by one, in a single basket', async () => {
    const bureau = list({ name: 'Restos du bureau', restaurant_ids: [MARCEL.id, SAKURA.id] })
    const onChange = vi.fn()
    render(<Harness lists={[bureau]} onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox', { name: /restos du bureau/i }))
    expect(hiddenValues('listIds')).toEqual([bureau.id])
    const basket = screen.getByRole('region', { name: 'Ta sélection' })
    expect(
      within(basket).getByRole('button', { name: 'Retirer la liste Restos du bureau' })
    ).toBeVisible()
    expect(within(basket).getByText('2 restos')).toBeInTheDocument()

    // Dans le carnet, les restos de la liste sont déjà là — cochés, verrouillés.
    await userEvent.click(screen.getByRole('tab', { name: 'Le carnet' }))
    const results = screen.getByRole('list', { name: 'Résultats' })
    const marcel = within(results).getByRole('checkbox', { name: /chez marcel/i })
    expect(marcel).toBeChecked()
    expect(marcel).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(marcel)
    expect(onChange).not.toHaveBeenCalled()

    // Un resto de plus, à l'unité : le panier mélange les deux.
    await userEvent.click(within(results).getByRole('checkbox', { name: /wok garden/i }))
    expect(onChange).toHaveBeenLastCalledWith([WOK.id])
    expect(hiddenValues('restaurantIds')).toEqual([WOK.id])
    expect(within(basket).getByText('3 restos')).toBeInTheDocument()
    expect(within(basket).getByRole('button', { name: 'Retirer Wok Garden' })).toBeVisible()

    // Retirer la liste depuis le panier libère ses restos.
    await userEvent.click(
      within(basket).getByRole('button', { name: 'Retirer la liste Restos du bureau' })
    )
    expect(hiddenValues('listIds')).toEqual([])
    expect(within(results).getByRole('checkbox', { name: /chez marcel/i })).not.toBeChecked()
    expect(within(basket).getByText('1 resto')).toBeInTheDocument()
  })

  it('should open Google on the restaurants around you, without typing anything', async () => {
    grantPosition()
    googleAnswers([SUSHI_PLACE])
    render(<Harness />)

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))

    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    const row = await screen.findByRole('checkbox', { name: /sushi bar sakura/i })
    expect(row).not.toBeChecked()
    expect(screen.getByText('Les plus proches de toi')).toBeInTheDocument()
    expect(within(row).getByText('320 m')).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/places/search')
    expect(JSON.parse(init.body)).toEqual({
      query: '',
      latitude: OPERA.latitude,
      longitude: OPERA.longitude,
    })
  })

  it('should say so when the position is refused, and still search by name', async () => {
    refusePosition()
    googleAnswers([SUSHI_PLACE])
    render(<Harness />)

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))
    expect(await screen.findByText(/position refusée/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Autour de moi' })).toBeVisible()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Chercher un restaurant' }), 'sushi')
    expect(await screen.findByRole('checkbox', { name: /sushi bar sakura/i })).toBeVisible()
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      query: 'sushi',
      latitude: null,
      longitude: null,
    })
  })

  it('should keep the Google results when leaving the tab and coming back', async () => {
    grantPosition()
    googleAnswers([SUSHI_PLACE])
    render(<Harness />)

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))
    await screen.findByRole('checkbox', { name: /sushi bar sakura/i })

    await userEvent.click(screen.getByRole('tab', { name: 'Le carnet' }))
    expect(screen.queryByRole('list', { name: 'Résultats Google' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))
    // Tout de suite là, sans spinner ni nouvel appel.
    expect(screen.getByRole('checkbox', { name: /sushi bar sakura/i })).toBeVisible()
    expect(screen.getByRole('list', { name: 'Résultats Google' })).not.toHaveAttribute('aria-busy')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('should show the next twenty on « Voir plus », and stop when Google has no more', async () => {
    grantPosition()
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [SUSHI_PLACE], nextPageToken: 'page-2' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [RAMEN_PLACE] }) })
    render(<Harness />)

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))
    await screen.findByRole('checkbox', { name: /sushi bar sakura/i })
    const more = screen.getByRole('button', { name: 'Voir plus' })

    await userEvent.click(more)
    expect(await screen.findByRole('checkbox', { name: /ramen ichiban/i })).toBeVisible()
    expect(screen.getByRole('checkbox', { name: /sushi bar sakura/i })).toBeVisible()
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toMatchObject({
      query: '',
      pageToken: 'page-2',
    })
    expect(screen.queryByRole('button', { name: 'Voir plus' })).not.toBeInTheDocument()
  })

  it('should import a Google place when checked, then toggle it without asking Google again', async () => {
    grantPosition()
    googleAnswers([SUSHI_PLACE])
    const imported = restaurant({
      name: 'Sushi Bar Sakura',
      source: 'google',
      place_id: SUSHI_PLACE.placeId,
    })
    let finishImport: (result: unknown) => void = () => {}
    importPlaceAction.mockReturnValue(new Promise((resolve) => (finishImport = resolve)))
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))
    const row = await screen.findByRole('checkbox', { name: /sushi bar sakura/i })

    // Coché à l'instant du clic, dans la liste comme dans le panier : la fiche suit.
    await userEvent.click(row)
    expect(row).toBeChecked()
    expect(row).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status', { name: 'Sushi Bar Sakura, import en cours' })).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'Ta sélection' })).getByText('1 resto')
    ).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()

    finishImport({ ok: true, data: imported })
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([imported.id]))
    expect(importPlaceAction).toHaveBeenCalledWith(SUSHI_PLACE.placeId)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /sushi bar sakura/i })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Retirer Sushi Bar Sakura' })).toBeVisible()

    await userEvent.click(screen.getByRole('checkbox', { name: /sushi bar sakura/i }))
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(importPlaceAction).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('checkbox', { name: /sushi bar sakura/i })).not.toBeChecked()

    // L'import est aussi arrivé dans le carnet, coché comme les autres.
    await userEvent.click(screen.getByRole('checkbox', { name: /sushi bar sakura/i }))
    await userEvent.click(screen.getByRole('tab', { name: 'Le carnet' }))
    const results = screen.getByRole('list', { name: 'Résultats' })
    expect(within(results).getByRole('checkbox', { name: /sushi bar sakura/i })).toBeChecked()
  })

  it('should take a failed import back out of the selection and say why', async () => {
    grantPosition()
    googleAnswers([SUSHI_PLACE])
    importPlaceAction.mockResolvedValue({ ok: false, error: 'Ce lieu n’existe plus chez Google.' })
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: /sushi bar sakura/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce lieu n’existe plus chez Google.')
    expect(screen.getByRole('checkbox', { name: /sushi bar sakura/i })).not.toBeChecked()
    expect(screen.queryByRole('region', { name: 'Ta sélection' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('should let a restaurant be added by hand from any source, prefilled with the search', async () => {
    grantPosition()
    googleAnswers([])
    render(<Harness />)

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Chercher un restaurant' }),
      'Le Bouchon'
    )
    await userEvent.click(screen.getByRole('button', { name: /ajouter un resto à la main/i }))

    expect(screen.getByLabelText(/nom du resto/i)).toHaveValue('Le Bouchon')
    expect(screen.queryByRole('list', { name: 'Résultats Google' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.getByRole('list', { name: 'Résultats Google' })).toBeInTheDocument()
  })

  it('should move between sources with the arrow keys', async () => {
    render(<Harness lists={[list({ restaurant_ids: [MARCEL.id] })]} />)

    screen.getByRole('tab', { name: 'Mes listes' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Le carnet' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Le carnet' })).toHaveFocus()
    expect(screen.getByRole('list', { name: 'Résultats' })).toBeInTheDocument()

    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Google' })).toHaveAttribute('aria-selected', 'true')
  })
})
