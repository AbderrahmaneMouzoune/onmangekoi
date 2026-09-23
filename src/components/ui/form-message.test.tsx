// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FormMessage } from './form-message'

describe('FormMessage', () => {
  it('should announce an error with the alert role', () => {
    render(<FormMessage error="Session introuvable" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Session introuvable')
  })

  it('should announce a success with the status role', () => {
    render(<FormMessage success="Pseudo enregistré" />)
    expect(screen.getByRole('status')).toHaveTextContent('Pseudo enregistré')
  })

  it('should render nothing without a message', () => {
    const { container } = render(<FormMessage />)
    expect(container).toBeEmptyDOMElement()
  })
})
