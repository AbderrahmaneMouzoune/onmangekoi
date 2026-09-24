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
import type { RecentWinnerDates } from '@/domain/recent-winners'
import type { RestaurantFilters } from '@/domain/restaurant-filters'

const searchRestaurantsAction = vi.hoisted(() => vi.fn())
const createRestaurantAction = vi.hoisted(() => vi.fn())
const findSimilarRestaurantsAction = vi.hoisted(() => vi.fn())
const importPlaceAction = vi.hoisted(() => vi.fn())
const seedNeighbourhoodAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/restaurants', () => ({
  searchRestaurantsAction,
  createRestaurantAction,
  findSimilarRestaurantsAction,
}))
vi.mock('@/actions/places', () => ({ importPlaceAction, seedNeighbourhoodAction }))
vi.mock('@/lib/analytics/client', () => ({ captureEvent: vi.fn() }))

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
    tags: [],
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
    is_public: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    restaurant_ids: [],
    ...overrides,
  }
}

const MARCEL = restaurant({
  name: 'Chez Marcel',
  cuisine_type: 'Français',
  price_level: 2,
  address: '3 rue du Four',
  city: 'Paris',
  /** Notre-Dame : environ 2,4 km de l'Opéra. */
  location: { lat: 48.853, lng: 2.3499 },
})
const SAKURA = restaurant({ name: 'Sakura', cuisine_type: 'Japonais', tags: ['vegan'] })
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
  rating: 4.5,
  ratingCount: 320,
  tags: [],
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
  onFiltersChange,
  recentWinners,
  excludeRecent,
  initialPage = PAGE,
}: {
  lists?: ListWithRestaurantIds[]
  google?: boolean
  onChange?: (ids: string[]) => void
  onFiltersChange?: (filters: RestaurantFilters) => void
  recentWinners?: RecentWinnerDates
  excludeRecent?: boolean
  initialPage?: RestaurantPage
}) {
  const [value, setValue] = useState<string[]>([])
  const [listIds, setListIds] = useState<string[]>([])
  return (
    <RestaurantSourcesProvider google={google}>
      <RestaurantPicker
        initialPage={initialPage}
        value={value}
        onChange={(ids) => {
          setValue(ids)
          onChange(ids)
        }}
        recentWinners={recentWinners}
        excludeRecent={excludeRecent}
        inputName="restaurantIds"
        lists={lists}
        selectedListIds={listIds}
        onListsChange={setListIds}
        listsInputName="listIds"
        onFiltersChange={onFiltersChange}
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

  it('should show each restaurant as an illustrated card with its facts', async () => {
    render(<Harness />)

    const marcel = screen.getByRole('checkbox', { name: /chez marcel/i })
    expect(marcel).toHaveTextContent('Français')
    expect(marcel).toHaveTextContent('€€')
    expect(marcel).toHaveTextContent('3 rue du Four, Paris')
    // Pas de photo : la vignette porte les initiales du resto.
    expect(within(marcel).getByText('CM')).toBeInTheDocument()
    expect(marcel).not.toHaveTextContent(/km/)

    // « Autour de moi » dans le carnet : la distance de chaque resto géolocalisé.
    grantPosition()
    await userEvent.click(screen.getByRole('button', { name: 'Autour de moi' }))
    expect(marcel).toHaveTextContent(/2,\d km/)
    expect(screen.getByRole('checkbox', { name: /wok garden/i })).not.toHaveTextContent(/km/)

    // Un second clic oublie la position.
    await userEvent.click(screen.getByRole('button', { name: 'Autour de toi' }))
    expect(marcel).not.toHaveTextContent(/km/)
  })

  it('should keep the basket on a single scrolling line, and empty it in one click', async () => {
    // jsdom ne défile pas : on lui prête un `scrollTo` pour vérifier l'appel.
    const scrollTo = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollTo', { value: scrollTo, configurable: true })
    const bureau = list({ name: 'Restos du bureau', restaurant_ids: [SAKURA.id] })
    render(<Harness lists={[bureau]} />)

    await userEvent.click(screen.getByRole('checkbox', { name: /restos du bureau/i }))
    await userEvent.click(screen.getByRole('tab', { name: 'Le carnet' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /chez marcel/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /wok garden/i }))

    const strip = screen.getByRole('list', { name: 'Sélection' })
    expect(within(strip).getAllByRole('listitem')).toHaveLength(3)
    expect(strip).toHaveClass('overflow-x-auto')
    expect(strip).not.toHaveClass('flex-wrap')
    // Le dernier pris est amené dans le champ.
    expect(scrollTo).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Tout retirer' }))
    expect(screen.queryByRole('region', { name: 'Ta sélection' })).not.toBeInTheDocument()
    expect(hiddenValues('restaurantIds')).toEqual([])
    expect(hiddenValues('listIds')).toEqual([])
    expect(screen.getByRole('checkbox', { name: /chez marcel/i })).not.toBeChecked()
    Reflect.deleteProperty(Element.prototype, 'scrollTo')
  })

  it('should illustrate a Google result with its rating and opening badge', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Lundi 2026-09-07, 12:30 — en plein service
    vi.setSystemTime(new Date(2026, 8, 7, 12, 30))
    grantPosition()
    googleAnswers([
      { ...SUSHI_PLACE, openingHours: { periods: [{ day: 1, open: '11:30', close: '14:30' }] } },
    ])
    render(<Harness />)

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))
    const row = await screen.findByRole('checkbox', { name: /sushi bar sakura/i })
    expect(row).toHaveTextContent('Japonais')
    expect(row).toHaveTextContent('€€')
    expect(row).toHaveTextContent('4,5')
    expect(row).toHaveTextContent('(320)')
    expect(within(row).getByText('Ouvert')).toBeInTheDocument()
    expect(within(row).getByText('320 m')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('should send a filter to the base and restart from the first page', async () => {
    const onFiltersChange = vi.fn()
    searchRestaurantsAction.mockResolvedValue({
      ok: true,
      data: { items: [SAKURA], hasMore: false, nextOffset: 1 },
    })
    render(<Harness onFiltersChange={onFiltersChange} />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Vegan' }))

    await waitFor(() =>
      expect(searchRestaurantsAction).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['vegan'], offset: 0 })
      )
    )
    // Le formulaire reflète le filtre dans l'URL : un lien se partage trié.
    expect(onFiltersChange).toHaveBeenCalledWith({
      priceMax: null,
      tags: ['vegan'],
      withinKm: null,
    })
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: /chez marcel/i })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('checkbox', { name: /sakura/i })).toBeInTheDocument()
  })

  it('should keep the filters on the next page of results', async () => {
    searchRestaurantsAction.mockResolvedValue({
      ok: true,
      data: { items: [SAKURA], hasMore: true, nextOffset: 1 },
    })
    render(<Harness />)

    await userEvent.click(screen.getByRole('radio', { name: 'Budget maximum €€' }))
    await screen.findByRole('button', { name: 'Afficher plus' })

    searchRestaurantsAction.mockResolvedValue({
      ok: true,
      data: { items: [WOK], hasMore: false, nextOffset: 2 },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Afficher plus' }))

    // Même filtre, page suivante : c'est la base qui pagine le résultat filtré.
    await waitFor(() =>
      expect(searchRestaurantsAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ priceMax: 2, offset: 1 })
      )
    )
    expect(await screen.findByRole('checkbox', { name: /wok garden/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /sakura/i })).toBeInTheDocument()
  })

  it('should offer to lift the filters rather than add a restaurant that exists', async () => {
    searchRestaurantsAction.mockResolvedValue({
      ok: true,
      data: { items: [], hasMore: false, nextOffset: 0 },
    })
    render(<Harness />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Casher' }))

    const clear = await screen.findByRole('button', { name: 'Efface les filtres' })
    expect(screen.queryByRole('button', { name: 'Ajoute-le' })).not.toBeInTheDocument()

    searchRestaurantsAction.mockResolvedValue({ ok: true, data: PAGE })
    await userEvent.click(clear)
    expect(await screen.findByRole('checkbox', { name: /chez marcel/i })).toBeInTheDocument()
  })

  it('should hide the distance filter until the position is known', async () => {
    render(<Harness />)

    expect(screen.queryByRole('radio', { name: /d’ici/ })).not.toBeInTheDocument()

    grantPosition()
    await userEvent.click(screen.getByRole('button', { name: 'Autour de moi' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Moins de 1 km d’ici' }))

    await waitFor(() =>
      expect(searchRestaurantsAction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          withinKm: 1,
          origin: { lat: OPERA.latitude, lng: OPERA.longitude },
        })
      )
    )

    // La position oubliée, le rayon n'a plus rien pour mesurer : il disparaît
    // et la recherche repart sans lui.
    await userEvent.click(screen.getByRole('button', { name: 'Autour de toi' }))
    expect(screen.queryByRole('radio', { name: /d’ici/ })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(searchRestaurantsAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ withinKm: null, origin: null })
      )
    )
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

  // ─── Anti-fatigue ──────────────────────────────────────────
  // La date est posée par rapport à l'horloge réelle : le libellé relatif
  // (« il y a 6 jours ») est alors le même à chaque exécution, sans avoir à
  // figer le temps sous `userEvent`.
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
  const WON: RecentWinnerDates = { [MARCEL.id]: sixDaysAgo }

  it('should badge a restaurant that won lately', () => {
    render(<Harness recentWinners={WON} />)

    expect(screen.getByText('Gagnant il y a 6 jours')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /chez marcel/i })).not.toBeDisabled()
  })

  it('should say nothing when nothing has won lately', () => {
    render(<Harness />)
    expect(screen.queryByText(/Gagnant/)).not.toBeInTheDocument()
  })

  it('should let a recent winner be picked while the anti-fatigue is off', async () => {
    const onChange = vi.fn()
    render(<Harness recentWinners={WON} onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox', { name: /chez marcel/i }))

    expect(onChange).toHaveBeenCalledWith([MARCEL.id])
  })

  it('should set a recent winner aside once the anti-fatigue is on', async () => {
    const onChange = vi.fn()
    render(<Harness recentWinners={WON} excludeRecent onChange={onChange} />)

    const row = screen.getByRole('checkbox', { name: /chez marcel/i })
    expect(row).not.toBeChecked()
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Écarté')).toBeInTheDocument()

    await userEvent.click(row)

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Ta sélection' })).not.toBeInTheDocument()
  })

  it('should leave the other restaurants alone', async () => {
    const onChange = vi.fn()
    render(<Harness recentWinners={WON} excludeRecent onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox', { name: /sakura/i }))

    expect(onChange).toHaveBeenCalledWith([SAKURA.id])
    const basket = screen.getByRole('region', { name: 'Ta sélection' })
    expect(within(basket).getByText('1 resto')).toBeInTheDocument()
  })

  it('should say the same thing on the Google tab for a place the address book knows', async () => {
    const sakuraFromGoogle = restaurant({
      name: 'Sushi Bar Sakura',
      place_id: SUSHI_PLACE.placeId,
    })
    grantPosition()
    googleAnswers([SUSHI_PLACE])
    render(
      <Harness
        initialPage={{ items: [sakuraFromGoogle], hasMore: false, nextOffset: 1 }}
        recentWinners={{ [sakuraFromGoogle.id]: sixDaysAgo }}
        excludeRecent
      />
    )

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))

    const row = await screen.findByRole('checkbox', { name: /sushi bar sakura/i })
    await waitFor(() => expect(row).toHaveAttribute('aria-disabled', 'true'))
    expect(row).not.toBeChecked()
    expect(within(row).getByText('Écarté')).toBeInTheDocument()
  })

  // ─── Amorcer le quartier ───────────────────────────────────
  it('should not offer to seed the neighbourhood before a position is given', async () => {
    refusePosition()
    googleAnswers([SUSHI_PLACE])
    render(<Harness />)

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))

    await screen.findByText(/position refusée/i)
    expect(screen.queryByRole('button', { name: 'Amorcer' })).not.toBeInTheDocument()
    expect(seedNeighbourhoodAction).not.toHaveBeenCalled()
  })

  it('should fill the address book in one gesture, without checking anything', async () => {
    grantPosition()
    googleAnswers([SUSHI_PLACE])
    const seeded = [
      restaurant({ name: 'Sushi Bar Sakura', source: 'google', place_id: SUSHI_PLACE.placeId }),
      restaurant({ name: 'Ramen Ichiban', source: 'google', place_id: RAMEN_PLACE.placeId }),
    ]
    seedNeighbourhoodAction.mockResolvedValue({
      ok: true,
      data: { restaurants: seeded, failed: 0, remaining: 2 },
    })
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Amorcer' }))

    expect(seedNeighbourhoodAction).toHaveBeenCalledWith(OPERA)
    expect(await screen.findByRole('status')).toHaveTextContent(
      '2 restos sont entrés dans le carnet. Il te reste 2 amorçages aujourd’hui.'
    )
    // Le carnet s'est rempli ; la sélection, elle, reste un choix.
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Ta sélection' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Le carnet' }))
    const results = screen.getByRole('list', { name: 'Résultats' })
    expect(within(results).getByRole('checkbox', { name: /ramen ichiban/i })).not.toBeChecked()
    expect(within(results).getByRole('checkbox', { name: /sushi bar sakura/i })).toBeVisible()
  })

  it('should keep the places that went through when part of the batch failed', async () => {
    grantPosition()
    googleAnswers([SUSHI_PLACE])
    seedNeighbourhoodAction.mockResolvedValue({
      ok: true,
      data: {
        restaurants: [restaurant({ name: 'Sushi Bar Sakura', place_id: SUSHI_PLACE.placeId })],
        failed: 2,
        remaining: 0,
      },
    })
    render(<Harness />)

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Amorcer' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 resto est entré dans le carnet, 2 n’ont pas pu être enregistrés. C’était ton dernier amorçage du jour.'
    )
    // Plus de créneau : le bouton reste là, éteint.
    expect(screen.getByRole('button', { name: 'Amorcer' })).toBeDisabled()
  })

  it('should say when the quota refuses the batch, without touching the address book', async () => {
    grantPosition()
    googleAnswers([SUSHI_PLACE])
    seedNeighbourhoodAction.mockResolvedValue({
      ok: false,
      error: 'Tu as épuisé tes amorçages de quartier pour aujourd’hui. Réessaie demain.',
    })
    render(<Harness />)

    await userEvent.click(screen.getByRole('tab', { name: 'Google' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Amorcer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/épuisé tes amorçages/i)
    expect(screen.getByRole('button', { name: 'Amorcer' })).toBeEnabled()
  })
})
