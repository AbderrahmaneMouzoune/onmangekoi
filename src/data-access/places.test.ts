import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Le marqueur `server-only` refuse d'être importé hors Server Component ; sous
// Vitest on le neutralise, comme le fait Next avec la condition `react-server`.
vi.mock('server-only', () => ({}))

/**
 * Passerelle Google : `fetch` est bouchonné, aucun appel ne sort. On vérifie
 * ce qui compte — la clé passe en en-tête et pas ailleurs, le cache évite les
 * appels payants, et rien de ce que Google renvoie en erreur ne remonte.
 */

const GOOGLE_PLACE = {
  id: 'ChIJsushi',
  displayName: { text: 'Sushi Bar Sakura' },
  formattedAddress: '12 rue de la Ré, Lyon',
  primaryType: 'sushi_restaurant',
  priceLevel: 'PRICE_LEVEL_MODERATE',
  location: { latitude: 45.76, longitude: 4.83 },
  addressComponents: [{ longText: 'Lyon', types: ['locality'] }],
}

const SUSHI_BAR = {
  placeId: 'ChIJsushi',
  name: 'Sushi Bar Sakura',
  address: '12 rue de la Ré, Lyon',
  city: 'Lyon',
  cuisineType: 'Japonais',
  latitude: 45.76,
  longitude: 4.83,
  priceLevel: 2,
}

const fetchMock = vi.fn()

/** Le cache vit dans le module : on le recharge à chaque test. */
async function importPlaces() {
  vi.resetModules()
  return import('./places')
}

describe('data-access/places', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    process.env.GOOGLE_PLACES_API_KEY = 'test-google-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.GOOGLE_PLACES_API_KEY
  })

  it('should send the key as a header and map what Google answers', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ places: [GOOGLE_PLACE] }) })
    const { searchPlaces, isPlacesSearchEnabled } = await importPlaces()

    expect(isPlacesSearchEnabled()).toBe(true)
    expect(await searchPlaces({ query: 'Sushi Sakura' })).toEqual([SUSHI_BAR])

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText')
    expect(init.headers['X-Goog-Api-Key']).toBe('test-google-key')
    expect(init.headers['X-Goog-FieldMask']).toContain('places.id')
    expect(init.body).not.toContain('test-google-key')
    expect(JSON.parse(init.body)).toMatchObject({
      textQuery: 'Sushi Sakura',
      includedType: 'restaurant',
    })
  })

  it('should serve a repeated search from the cache, whatever the casing', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ places: [GOOGLE_PLACE] }) })
    const { searchPlaces } = await importPlaces()

    await searchPlaces({ query: 'Sushi Sakura' })
    await searchPlaces({ query: '  sushi   sakura ' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('should bias the search only when a position is given', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ places: [GOOGLE_PLACE] }) })
    const { searchPlaces } = await importPlaces()

    await searchPlaces({ query: 'sushi' })
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).locationBias).toBeUndefined()

    await searchPlaces({ query: 'sushi', latitude: 45.76, longitude: 4.83 })
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).locationBias.circle.center).toEqual({
      latitude: 45.76,
      longitude: 4.83,
    })
  })

  it('should read an imported place from the search cache, without paying twice', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ places: [GOOGLE_PLACE] }) })
    const { searchPlaces, getPlaceDetails } = await importPlaces()

    await searchPlaces({ query: 'sushi' })
    expect(await getPlaceDetails('ChIJsushi')).toEqual(SUSHI_BAR)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('should ask Google for a place it has never seen', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => GOOGLE_PLACE })
    const { getPlaceDetails } = await importPlaces()

    expect(await getPlaceDetails('ChIJsushi')).toEqual(SUSHI_BAR)
    expect(fetchMock.mock.calls[0]![0]).toBe('https://places.googleapis.com/v1/places/ChIJsushi')
  })

  it('should never leak the body Google returns on an error', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'API key test-google-key is not authorized',
    })
    const { searchPlaces } = await importPlaces()

    await expect(searchPlaces({ query: 'sushi' })).rejects.toThrow(
      'La recherche Google a échoué. Réessaie dans un instant.'
    )
    expect(logged).toHaveBeenCalled()
  })

  it('should not call Google at all when no key is configured', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY
    const { searchPlaces, isPlacesSearchEnabled } = await importPlaces()

    expect(isPlacesSearchEnabled()).toBe(false)
    await expect(searchPlaces({ query: 'sushi' })).rejects.toThrow(/pas configurée/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
