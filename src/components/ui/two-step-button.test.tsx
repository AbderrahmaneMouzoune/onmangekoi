// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TwoStepButton } from './two-step-button'

describe('TwoStepButton', () => {
  it('should expose the button role and its label as accessible name', () => {
    render(<TwoStepButton label="Clôturer" confirmLabel="Confirmer ?" onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Clôturer' })).toHaveAttribute('aria-live', 'polite')
  })

  it('should announce the armed state before confirming', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<TwoStepButton label="Clôturer" confirmLabel="Confirmer ?" onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Clôturer' }))
    expect(onConfirm).not.toHaveBeenCalled()

    await user.click(await screen.findByRole('button', { name: 'Confirmer ?' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
