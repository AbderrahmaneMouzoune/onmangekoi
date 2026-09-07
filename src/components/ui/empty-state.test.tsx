// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'
import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('should read its title, its description and its action', () => {
    render(
      <EmptyState
        icon={<svg aria-hidden="true" />}
        title="Aucune liste"
        description="Crée ta première liste de favoris."
        action={<Button>Créer une liste</Button>}
      />
    )
    expect(screen.getByText('Aucune liste')).toBeInTheDocument()
    expect(screen.getByText('Crée ta première liste de favoris.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer une liste' })).toBeInTheDocument()
  })

  it('should drop the description and the action when there is none', () => {
    render(<EmptyState title="Aucune session" />)
    expect(screen.getByText('Aucune session')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
