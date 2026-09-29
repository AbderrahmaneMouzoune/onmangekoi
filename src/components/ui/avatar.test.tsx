// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Avatar } from './avatar'

describe('Avatar', () => {
  it('should stay out of the accessible tree: the pseudo is written next to it', () => {
    render(<Avatar name="Alex Dupont" />)
    const initials = screen.getByText('AD')
    expect(initials).toHaveAttribute('aria-hidden', 'true')
  })

  it('should show a question mark rather than render empty, in any language', () => {
    render(<Avatar name={null} />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })
})
