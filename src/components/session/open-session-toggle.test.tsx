// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { OpenSessionToggle } from './open-session-toggle'

function hidden(name: string): HTMLInputElement | null {
  return document.querySelector(`input[type="hidden"][name="${name}"]`)
}

function Harness() {
  const [checked, setChecked] = useState(false)
  return <OpenSessionToggle checked={checked} onChange={setChecked} />
}

describe('OpenSessionToggle', () => {
  it('should send nothing while unchecked: the session keeps its waiting room', () => {
    renderWithIntl(<Harness />)
    expect(screen.getByRole('checkbox', { name: /session ouverte/i })).not.toBeChecked()
    expect(hidden('open')).toBeNull()
    expect(screen.getByText(/Salle d’attente/)).toBeInTheDocument()
  })

  it('should send the open mode once checked, and say what it changes', async () => {
    renderWithIntl(<Harness />)
    await userEvent.click(screen.getByRole('checkbox', { name: /session ouverte/i }))

    expect(screen.getByRole('checkbox', { name: /session ouverte/i })).toBeChecked()
    expect(hidden('open')).toHaveValue('on')
    expect(screen.getByText(/Pas de salle d’attente/)).toBeInTheDocument()
  })
})
