// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DeadlinePicker } from './deadline-picker'

/** Le formulaire ne transmet que des champs cachés : c'est eux qu'on lit. */
function hidden(name: string): HTMLInputElement | null {
  return document.querySelector(`input[type="hidden"][name="${name}"]`)
}

describe('DeadlinePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Lundi 7 septembre 2026, 11:30 heure locale.
    vi.setSystemTime(new Date(2026, 8, 7, 11, 30))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should send nothing at all without a deadline', () => {
    render(<DeadlinePicker />)
    expect(screen.getByRole('radio', { name: 'Sans limite' })).toBeChecked()
    expect(hidden('closesInMinutes')).toBeNull()
    expect(hidden('closesAt')).toBeNull()
  })

  it('should send a duration, resolved later on the server clock', async () => {
    render(<DeadlinePicker />)
    await userEvent.click(screen.getByRole('radio', { name: 'dans 10 min' }))
    expect(hidden('closesInMinutes')).toHaveValue('10')
    expect(hidden('closesAt')).toBeNull()
  })

  it('should turn a chosen time into an absolute instant', async () => {
    render(<DeadlinePicker />)
    await userEvent.click(screen.getByRole('radio', { name: 'à une heure' }))
    await userEvent.type(screen.getByLabelText(/heure de clôture/i), '12:00')

    expect(hidden('closesAt')).toHaveValue(new Date(2026, 8, 7, 12, 0).toISOString())
    expect(hidden('closesInMinutes')).toBeNull()
  })

  it('should send nothing while the chosen time is incomplete', async () => {
    render(<DeadlinePicker />)
    await userEvent.click(screen.getByRole('radio', { name: 'à une heure' }))
    expect(hidden('closesAt')).toBeNull()
  })
})
