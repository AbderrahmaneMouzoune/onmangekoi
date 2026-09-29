// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { LocaleSwitcher } from './locale-switcher'

const setLocaleAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/locale', () => ({ setLocaleAction }))

describe('LocaleSwitcher', () => {
  const reload = vi.fn()

  beforeEach(() => {
    setLocaleAction.mockReset()
    setLocaleAction.mockResolvedValue({ ok: true, data: undefined })
    reload.mockReset()
    vi.stubGlobal('location', { ...window.location, reload })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should name each language in its own language and mark the current one', () => {
    renderWithIntl(<LocaleSwitcher />, { locale: 'fr' })

    expect(screen.getByRole('group', { name: 'Langue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true')
    const english = screen.getByRole('button', { name: 'English' })
    expect(english).toHaveAttribute('aria-pressed', 'false')
    expect(english).toHaveAttribute('lang', 'en')
  })

  it('should remember the new language, then reload through the proxy', async () => {
    renderWithIntl(<LocaleSwitcher />, { locale: 'fr' })

    await userEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(setLocaleAction).toHaveBeenCalledWith('en')
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it('should do nothing when the current language is picked again', async () => {
    renderWithIntl(<LocaleSwitcher />, { locale: 'en' })

    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(setLocaleAction).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})
