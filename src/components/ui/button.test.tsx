// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './button'

describe('Button', () => {
  it('should expose the button role and its label as accessible name', () => {
    render(<Button>Lancer le vote</Button>)
    expect(screen.getByRole('button', { name: 'Lancer le vote' })).toBeInTheDocument()
  })

  it('should let an icon-only button carry its name with aria-label', () => {
    render(
      <Button size="icon" aria-label="Fermer">
        <svg aria-hidden="true" />
      </Button>
    )
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument()
  })

  it('should stay reachable and activable at the keyboard', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Créer la session</Button>)

    await user.tab()
    expect(screen.getByRole('button', { name: 'Créer la session' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('should mark a disabled button as such rather than hiding it', () => {
    render(<Button disabled>Lancer le vote</Button>)
    expect(screen.getByRole('button', { name: 'Lancer le vote' })).toBeDisabled()
  })
})
