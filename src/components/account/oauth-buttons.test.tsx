// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OAuthButtons } from './oauth-buttons'

const startOAuthAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/auth', () => ({ startOAuthAction }))

describe('OAuthButtons', () => {
  beforeEach(() => {
    startOAuthAction.mockReset()
    startOAuthAction.mockResolvedValue(null)
  })

  it('should render nothing while no provider is enabled', () => {
    const { container } = render(<OAuthButtons providers={[]} intent="link" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('should offer only the enabled providers', () => {
    render(<OAuthButtons providers={['google']} intent="login" />)
    expect(screen.getByRole('button', { name: /continuer avec google/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continuer avec apple/i })).toBeNull()
  })

  it('should send the provider, the intent and the destination to the server', async () => {
    render(<OAuthButtons providers={['google', 'apple']} intent="login" next="/lists" />)
    await userEvent.click(screen.getByRole('button', { name: /continuer avec apple/i }))

    expect(startOAuthAction).toHaveBeenCalledTimes(1)
    const formData = startOAuthAction.mock.calls[0]?.[1] as FormData
    expect(formData.get('provider')).toBe('apple')
    expect(formData.get('intent')).toBe('login')
    expect(formData.get('next')).toBe('/lists')
  })

  it('should show the translated error returned by the server', async () => {
    startOAuthAction.mockResolvedValue({ error: 'Cette connexion n’est pas disponible.' })
    render(<OAuthButtons providers={['google']} intent="link" />)
    await userEvent.click(screen.getByRole('button', { name: /continuer avec google/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/pas disponible/i)
  })
})
