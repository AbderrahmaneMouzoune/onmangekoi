// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { RulesPicker } from './rules-picker'

/** Le formulaire ne transmet que des champs cachés : c'est eux qu'on lit. */
function hidden(name: string): HTMLInputElement | null {
  return document.querySelector(`input[type="hidden"][name="${name}"]`)
}

function group(legend: string) {
  return screen.getByRole('radiogroup', { name: legend })
}

describe('RulesPicker', () => {
  it('should start on the historical rules', () => {
    render(<RulesPicker />)
    expect(hidden('superlikes')).toHaveValue('1')
    expect(hidden('vetos')).toHaveValue('1')
    expect(hidden('closeAtRatio')).toHaveValue('1')
  })

  it('should keep the summary readable while folded', () => {
    render(<RulesPicker />)
    expect(screen.getByText(/1 coup de cœur · 1 veto/)).toBeInTheDocument()
  })

  it('should send the quota and the threshold that were picked', async () => {
    render(<RulesPicker />)

    await userEvent.click(within(group('Vetos par personne')).getByRole('radio', { name: '2' }))
    await userEvent.click(
      within(group('Coups de cœur par personne')).getByRole('radio', { name: 'Aucun' })
    )
    await userEvent.click(within(group('Seuil de clôture')).getByRole('radio', { name: /80/ }))

    expect(hidden('vetos')).toHaveValue('2')
    expect(hidden('superlikes')).toHaveValue('0')
    expect(hidden('closeAtRatio')).toHaveValue('0.8')
    expect(screen.getByText(/Aucun coup de cœur · 2 vetos/)).toBeInTheDocument()
  })

  it('should submit its fields even while folded', () => {
    // Le contenu d'un `<details>` fermé reste dans le DOM : les champs cachés
    // partent avec le formulaire, déplié ou non.
    const { container } = render(<RulesPicker />)
    expect(container.querySelector('details')).not.toHaveAttribute('open')
    expect(hidden('superlikes')).toBeInTheDocument()
    expect(hidden('closeAtRatio')).toBeInTheDocument()
  })
})
