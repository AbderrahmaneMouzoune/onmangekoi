// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TwoStepButton } from './two-step-button'

describe('TwoStepButton', () => {
  it('should arm on the first press and confirm on the second', async () => {
    const onConfirm = vi.fn()
    render(<TwoStepButton label="Supprimer" confirmLabel="Confirmer" onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('should disarm on Escape without confirming', async () => {
    const onConfirm = vi.fn()
    render(<TwoStepButton label="Supprimer" confirmLabel="Confirmer" onConfirm={onConfirm} />)

    const button = screen.getByRole('button', { name: 'Supprimer' })
    button.focus()
    await userEvent.keyboard('{Enter}')
    expect(button).toHaveTextContent('Confirmer')

    await userEvent.keyboard('{Escape}')
    expect(button).toHaveTextContent('Supprimer')
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
