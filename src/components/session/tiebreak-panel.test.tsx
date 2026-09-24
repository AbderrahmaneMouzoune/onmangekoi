// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TiebreakPanel } from './tiebreak-panel'

const createRunoffSessionAction = vi.hoisted(() => vi.fn())
const drawWinnerAction = vi.hoisted(() => vi.fn())
const push = vi.hoisted(() => vi.fn())
const refresh = vi.hoisted(() => vi.fn())

vi.mock('@/actions/sessions', () => ({ createRunoffSessionAction, drawWinnerAction }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock('@/hooks/use-session-watch', () => ({ useSessionWatch: vi.fn() }))
vi.mock('@/lib/analytics/client', () => ({ captureEvent: vi.fn() }))

const SESSION_ID = '11111111-1111-4111-8111-111111111111'

function renderPanel(props: Partial<React.ComponentProps<typeof TiebreakPanel>> = {}) {
  return render(
    <TiebreakPanel
      sessionId={SESSION_ID}
      tiedNames={['Gyoza Bar', 'Poké House']}
      method={null}
      isHost
      runoff={null}
      {...props}
    />
  )
}

/** Le bouton se confirme en deux temps : un clic arme, un second déclenche. */
async function press(name: RegExp) {
  const button = screen.getByRole('button', { name })
  await userEvent.click(button)
  await userEvent.click(button)
}

describe('TiebreakPanel', () => {
  beforeEach(() => {
    createRunoffSessionAction.mockReset()
    drawWinnerAction.mockReset()
    push.mockReset()
    refresh.mockReset()
  })

  it('should name the tied restaurants and offer both ways out to the host', () => {
    renderPanel()
    expect(screen.getByText(/Gyoza Bar et Poké House/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /second tour/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tirage au sort/i })).toBeInTheDocument()
  })

  it('should leave the decision to the host for everyone else', () => {
    renderPanel({ isHost: false })
    expect(screen.getByText(/Le host va trancher/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('should send the host to the runoff it just created', async () => {
    createRunoffSessionAction.mockResolvedValue({
      ok: true,
      data: { invite_code: '7K3M9P' },
    })
    renderPanel()
    await press(/second tour/i)
    expect(createRunoffSessionAction).toHaveBeenCalledWith(SESSION_ID)
    expect(push).toHaveBeenCalledWith('/sessions/7K3M9P')
  })

  it('should re-read the ranking once the draw is done', async () => {
    drawWinnerAction.mockResolvedValue({ ok: true, data: {} })
    renderPanel()
    await press(/tirage au sort/i)
    expect(drawWinnerAction).toHaveBeenCalledWith(SESSION_ID)
    expect(refresh).toHaveBeenCalled()
  })

  it('should show what the database refused', async () => {
    drawWinnerAction.mockResolvedValue({ ok: false, error: 'Seul le host peut faire ça.' })
    renderPanel()
    await press(/tirage au sort/i)
    expect(await screen.findByText('Seul le host peut faire ça.')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('should point to the runoff under way instead of asking again', () => {
    renderPanel({ method: 'runoff', runoff: { url: '/sessions/7K3M9P', status: 'voting' } })
    expect(screen.getByRole('heading', { name: 'Second tour en cours' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /rejoindre le second tour/i })).toHaveAttribute(
      'href',
      '/sessions/7K3M9P'
    )
    expect(screen.queryByRole('button', { name: /tirage au sort/i })).not.toBeInTheDocument()
  })

  it('should link to the runoff ranking once it is over', () => {
    renderPanel({
      method: 'runoff',
      runoff: { url: '/sessions/7K3M9P/results', status: 'closed' },
    })
    expect(screen.getByRole('link', { name: /voir le classement du second tour/i })).toBeVisible()
  })
})
