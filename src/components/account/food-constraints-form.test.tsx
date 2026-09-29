// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FoodConstraintsForm } from './food-constraints-form'

const saveFoodConstraintsAction = vi.hoisted(() => vi.fn())
const captureEvent = vi.hoisted(() => vi.fn())

vi.mock('@/actions/food-constraints', () => ({ saveFoodConstraintsAction }))
vi.mock('@/lib/analytics/client', () => ({ captureEvent }))

describe('FoodConstraintsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    saveFoodConstraintsAction.mockResolvedValue({
      success: 'C’est noté : tes sessions le signaleront.',
    })
  })

  it('should start from what was already declared', () => {
    render(<FoodConstraintsForm initial={{ tags: ['halal'], maxPriceLevel: 2 }} />)

    expect(screen.getByRole('checkbox', { name: 'Halal' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Vegan' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Au plus €€' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Pas de plafond' })).not.toBeChecked()
  })

  it('should offer no ceiling by default, nothing being mandatory', () => {
    render(<FoodConstraintsForm initial={{ tags: [], maxPriceLevel: null }} />)

    expect(screen.getByRole('radio', { name: 'Pas de plafond' })).toBeChecked()
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked()
  })

  it('should send the checked diets and budget, then count them — only count them', async () => {
    render(<FoodConstraintsForm initial={{ tags: [], maxPriceLevel: null }} />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Végétarien' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Au plus €€' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(saveFoodConstraintsAction).toHaveBeenCalled())
    const formData = saveFoodConstraintsAction.mock.calls[0]![1] as FormData
    expect(formData.getAll('tags')).toEqual(['vegetarian'])
    expect(formData.get('maxPriceLevel')).toBe('2')

    expect(await screen.findByText(/c’est noté/i)).toBeInTheDocument()
    expect(captureEvent).toHaveBeenCalledWith('constraints_updated', { constraint_count: 2 })
  })

  it('should let everything be taken back with the same button', async () => {
    saveFoodConstraintsAction.mockResolvedValue({ success: 'Plus rien de déclaré.' })
    render(<FoodConstraintsForm initial={{ tags: ['vegan'], maxPriceLevel: 3 }} />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Vegan' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Pas de plafond' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(saveFoodConstraintsAction).toHaveBeenCalled())
    const formData = saveFoodConstraintsAction.mock.calls[0]![1] as FormData
    expect(formData.getAll('tags')).toEqual([])
    expect(formData.get('maxPriceLevel')).toBe('')
    expect(await screen.findByText('Plus rien de déclaré.')).toBeInTheDocument()
    expect(captureEvent).toHaveBeenCalledWith('constraints_updated', { constraint_count: 0 })
  })
})
