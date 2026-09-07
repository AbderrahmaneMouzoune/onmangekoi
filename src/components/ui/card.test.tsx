// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card'

describe('Card', () => {
  it('should expose its title as a heading and its description as text', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Tes listes</CardTitle>
          <CardDescription>Les restos que tu ressors chaque semaine.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Deux listes</p>
        </CardContent>
      </Card>
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Tes listes' })).toBeInTheDocument()
    expect(screen.getByText('Les restos que tu ressors chaque semaine.')).toBeInTheDocument()
  })

  it('should add no role of its own around the content', () => {
    const { container } = render(
      <Card>
        <CardTitle>Salle d’attente</CardTitle>
      </Card>
    )
    expect(container.querySelector('[data-slot="card"]')).not.toHaveAttribute('role')
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })
})
