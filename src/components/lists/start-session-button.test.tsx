// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { takeSessionEntry } from '@/lib/analytics/handoff'

import { StartSessionButton } from './start-session-button'

const startSessionFromListAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/lists', () => ({ startSessionFromListAction }))

const CODE = 'H4V2Q8ZX0M'

describe('StartSessionButton', () => {
  beforeEach(() => {
    startSessionFromListAction.mockReset()
    startSessionFromListAction.mockResolvedValue({ ok: true, data: undefined })
    window.sessionStorage.clear()
  })

  it('should send someone without a pseudo through onboarding, and back to the list', async () => {
    render(<StartSessionButton identifier={CODE} setupHref="/setup?next=%2Fl%2FH4V2Q8ZX0M" />)

    const link = screen.getByRole('link', { name: /lancer une session/i })
    expect(link).toHaveAttribute('href', '/setup?next=%2Fl%2FH4V2Q8ZX0M')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('should open the session straight away for someone who has one', async () => {
    render(<StartSessionButton identifier={CODE} />)

    await userEvent.click(screen.getByRole('button', { name: /lancer une session/i }))

    expect(startSessionFromListAction).toHaveBeenCalledWith(CODE)
    // L'intention est posée avant la navigation : la salle la consomme à
    // l'arrivée et compte une création, pas une entrée par lien.
    expect(takeSessionEntry()).toEqual({ kind: 'created', listCount: 1 })
  })

  it('should say why nothing happened when the list leads nowhere', async () => {
    startSessionFromListAction.mockResolvedValue({ ok: false, error: 'Cette liste est vide.' })
    render(<StartSessionButton identifier={CODE} />)

    await userEvent.click(screen.getByRole('button', { name: /lancer une session/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Cette liste est vide.')
  })
})
