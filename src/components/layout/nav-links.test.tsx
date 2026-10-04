// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { StaticNavLinks } from './nav-links'

describe('StaticNavLinks', () => {
  it('should mark the current page, prefix included', () => {
    renderWithIntl(<StaticNavLinks pathname="/lists/H4V2Q8ZX0M" />)
    expect(screen.getByRole('link', { name: 'Mes listes' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Accueil' })).not.toHaveAttribute('aria-current')
  })

  it('should match the home only exactly', () => {
    renderWithIntl(<StaticNavLinks pathname="/sessions/7K3M9P" />)
    expect(screen.getByRole('link', { name: 'Accueil' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Nouvelle session' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('should mark nothing when the path is unknown', () => {
    renderWithIntl(<StaticNavLinks />)
    screen.getAllByRole('link').forEach((link) => expect(link).not.toHaveAttribute('aria-current'))
  })

  it('should speak the interface language', () => {
    renderWithIntl(<StaticNavLinks pathname="/lists" />, { locale: 'en' })
    expect(screen.getByRole('link', { name: 'My lists' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'title',
      'Shortcut: g then h'
    )
  })
})
