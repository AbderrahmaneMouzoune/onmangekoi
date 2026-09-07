// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StaticNavLinks } from './nav-links'

describe('StaticNavLinks', () => {
  it('should mark the current page, prefix included', () => {
    render(<StaticNavLinks pathname="/lists/H4V2Q8ZX0M" />)
    expect(screen.getByRole('link', { name: 'Mes listes' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Accueil' })).not.toHaveAttribute('aria-current')
  })

  it('should match the home only exactly', () => {
    render(<StaticNavLinks pathname="/sessions/7K3M9P" />)
    expect(screen.getByRole('link', { name: 'Accueil' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Nouvelle session' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('should mark nothing when the path is unknown', () => {
    render(<StaticNavLinks />)
    screen.getAllByRole('link').forEach((link) => expect(link).not.toHaveAttribute('aria-current'))
  })
})
