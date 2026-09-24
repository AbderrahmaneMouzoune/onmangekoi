// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { NO_FILTERS, type RestaurantFilters } from '@/domain/restaurant-filters'

import { RestaurantFiltersBar } from './restaurant-filters'

import type { GeoPoint } from '@/lib/maps'

/** Opéra Garnier, Paris — la position que « Autour de moi » aurait donnée. */
const HERE: GeoPoint = { lat: 48.8719, lng: 2.3316 }

function setup(value: RestaurantFilters = NO_FILTERS, here: GeoPoint | null = null) {
  const onChange = vi.fn()
  render(<RestaurantFiltersBar value={value} onChange={onChange} here={here} />)
  return { onChange }
}

describe('RestaurantFiltersBar', () => {
  it('should ask for a maximum budget', async () => {
    const { onChange } = setup()

    await userEvent.click(screen.getByRole('radio', { name: 'Budget maximum €€' }))

    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, priceMax: 2 })
  })

  it('should let the same budget be pressed twice to drop it', async () => {
    const { onChange } = setup({ ...NO_FILTERS, priceMax: 2 })

    await userEvent.click(screen.getByRole('radio', { name: 'Budget maximum €€' }))

    expect(onChange).toHaveBeenCalledWith(NO_FILTERS)
  })

  it('should add a diet to the ones already asked for', async () => {
    const { onChange } = setup({ ...NO_FILTERS, tags: ['vegan'] })

    await userEvent.click(screen.getByRole('checkbox', { name: 'Halal' }))

    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, tags: ['vegan', 'halal'] })
  })

  it('should hide the distance filter entirely without a position', () => {
    setup()

    expect(screen.queryByRole('radio', { name: /d’ici/ })).not.toBeInTheDocument()
  })

  it('should show the radiuses once the position is known', async () => {
    const { onChange } = setup(NO_FILTERS, HERE)

    await userEvent.click(screen.getByRole('radio', { name: 'Moins de 500 m d’ici' }))

    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, withinKm: 0.5 })
  })

  it('should say what an active filter hides', () => {
    setup({ priceMax: 2, tags: ['vegan'], withinKm: 1 }, HERE)

    expect(
      screen.getByText(
        'Les restos dont le budget n’est pas renseigné, qui ne déclarent pas ce régime et dont l’adresse n’est pas localisée n’apparaissent pas.'
      )
    ).toBeInTheDocument()
  })

  it('should not count a radius that has no position to measure from', () => {
    setup({ ...NO_FILTERS, withinKm: 1 })

    expect(screen.queryByRole('button', { name: /tout effacer/i })).not.toBeInTheDocument()
  })

  it('should clear every filter at once', async () => {
    const { onChange } = setup({ priceMax: 3, tags: ['halal'], withinKm: 2 }, HERE)

    await userEvent.click(screen.getByRole('button', { name: /tout effacer/i }))

    expect(onChange).toHaveBeenCalledWith(NO_FILTERS)
  })

  it('should stay quiet while no filter is set', () => {
    setup()

    expect(screen.queryByRole('button', { name: /tout effacer/i })).not.toBeInTheDocument()
  })
})
