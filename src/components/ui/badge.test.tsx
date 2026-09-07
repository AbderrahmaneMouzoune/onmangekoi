// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge } from './badge'

describe('Badge', () => {
  it('should read as plain text, without a role of its own', () => {
    const { container } = render(<Badge>Coup de cœur</Badge>)
    expect(screen.getByText('Coup de cœur')).toBeInTheDocument()
    expect(container.querySelector('[role]')).toBeNull()
  })

  it('should forward a role and a name when the badge carries a state', () => {
    render(
      <Badge variant="live" role="status" aria-label="Session en cours">
        En direct
      </Badge>
    )
    expect(screen.getByRole('status', { name: 'Session en cours' })).toHaveTextContent('En direct')
  })
})
