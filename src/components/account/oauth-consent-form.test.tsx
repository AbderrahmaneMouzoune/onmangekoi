// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OAuthConsentForm } from './oauth-consent-form'
import { RevokeGrantButton } from './revoke-grant-button'

// Les Server Actions ne tournent pas sous jsdom : seul le balisage compte ici.
vi.mock('@/app/[locale]/oauth/actions', () => ({
  decideAuthorizationAction: vi.fn(),
  revokeOAuthGrantAction: vi.fn(async () => ({ ok: true, data: undefined })),
}))

describe('OAuthConsentForm', () => {
  it('should send the request id and the clicked decision, never a boolean', () => {
    const { container } = render(
      <OAuthConsentForm
        authorizationId="auth-123"
        labels={{ approve: 'Autoriser', deny: 'Refuser' }}
      />
    )

    const hidden = container.querySelector('input[name="authorization_id"]')
    expect(hidden).toHaveValue('auth-123')
    expect(screen.getByRole('button', { name: 'Autoriser' })).toHaveAttribute('value', 'approve')
    expect(screen.getByRole('button', { name: 'Refuser' })).toHaveAttribute('value', 'deny')
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'submit')
      expect(button).toHaveAttribute('name', 'decision')
    }
  })
})

describe('RevokeGrantButton', () => {
  const labels = {
    disconnect: 'Déconnecter',
    confirm: 'Confirmer la déconnexion',
    accessible: 'Déconnecter Claude',
  }

  it('should name the app it disconnects', () => {
    render(<RevokeGrantButton clientId="c1" labels={labels} />)
    expect(screen.getByRole('button', { name: 'Déconnecter Claude' })).toBeInTheDocument()
  })

  it('should ask for a confirmation before revoking', () => {
    render(<RevokeGrantButton clientId="c1" labels={labels} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: 'Confirmer la déconnexion' })).toBeInTheDocument()
  })
})
