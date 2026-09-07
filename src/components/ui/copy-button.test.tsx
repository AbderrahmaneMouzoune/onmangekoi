// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CopyButton } from './copy-button'

const writeText = vi.fn()

/**
 * `userEvent.setup()` pose son propre presse-papier sur la fenêtre : il faut
 * remettre le nôtre après, sinon c'est le sien qui reçoit la copie.
 */
function stubClipboard() {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

beforeEach(stubClipboard)

describe('CopyButton', () => {
  it('should expose the button role and its label as accessible name', () => {
    render(<CopyButton value="7K3M9P" label="Copier le code" />)
    expect(screen.getByRole('button', { name: 'Copier le code' })).toBeInTheDocument()
  })

  it('should rename itself once copied, in a live region', async () => {
    const user = userEvent.setup()
    stubClipboard()
    render(<CopyButton value="7K3M9P" label="Copier le code" />)

    const button = screen.getByRole('button', { name: 'Copier le code' })
    expect(button).toHaveAttribute('aria-live', 'polite')

    await user.click(button)

    expect(writeText).toHaveBeenCalledWith('7K3M9P')
    expect(await screen.findByRole('button', { name: 'Copié' })).toBeInTheDocument()
  })
})
