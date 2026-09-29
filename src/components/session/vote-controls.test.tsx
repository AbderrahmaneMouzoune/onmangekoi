// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { VoteControls } from './vote-controls'

import type { JokerQuotas } from '@/domain/session-rules'

const quotas = (overrides: Partial<JokerQuotas> = {}): JokerQuotas => ({
  fav: { limit: 1, remaining: 1 },
  veto: { limit: 1, remaining: 1 },
  ...overrides,
})

describe('VoteControls', () => {
  it('should render the four vote actions', () => {
    renderWithIntl(<VoteControls onVote={vi.fn()} jokers={quotas()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(4)
    expect(screen.getByRole('button', { name: /veto/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /coup de cœur/i })).toBeEnabled()
  })

  it('should call onVote with the value of the pressed action', async () => {
    const onVote = vi.fn()
    renderWithIntl(<VoteControls onVote={onVote} jokers={quotas()} />)
    await userEvent.click(screen.getByRole('button', { name: /ça me va/i }))
    await userEvent.click(screen.getByRole('button', { name: /bof/i }))
    await userEvent.click(screen.getByRole('button', { name: /coup de cœur/i }))
    await userEvent.click(screen.getByRole('button', { name: /veto/i }))
    expect(onVote.mock.calls.map((call) => call[0])).toEqual([1, 0, 2, -2])
  })

  it('should name the actions and their quotas in English', () => {
    renderWithIntl(
      <VoteControls onVote={vi.fn()} jokers={quotas({ veto: { limit: 3, remaining: 2 } })} />,
      { locale: 'en' }
    )
    expect(
      screen.getByRole('button', { name: 'Veto — Never. Counts −2, limited quota. 2 left' })
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Works for me — I’m in. Counts +1.' })).toBeEnabled()
    expect(screen.getByRole('group', { name: 'Vote' })).toBeInTheDocument()
  })

  it('should disable a joker once its quota is spent', () => {
    renderWithIntl(
      <VoteControls onVote={vi.fn()} jokers={quotas({ fav: { limit: 1, remaining: 0 } })} />
    )
    expect(screen.getByRole('button', { name: /coup de cœur/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /veto/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /coup de cœur/i })).toHaveTextContent(/épuisé/)
  })

  it('should count what is left of a larger quota', () => {
    renderWithIntl(
      <VoteControls onVote={vi.fn()} jokers={quotas({ veto: { limit: 3, remaining: 2 } })} />
    )
    const veto = screen.getByRole('button', { name: /veto/i })
    expect(veto).toBeEnabled()
    expect(veto).toHaveTextContent(/2 restants/)
  })

  it('should put a joker out of play when the session grants none', () => {
    renderWithIntl(
      <VoteControls onVote={vi.fn()} jokers={quotas({ veto: { limit: 0, remaining: 0 } })} />
    )
    const veto = screen.getByRole('button', { name: /veto/i })
    expect(veto).toBeDisabled()
    expect(veto).toHaveTextContent(/hors jeu/)
  })

  it('should disable everything while a vote is in flight', () => {
    renderWithIntl(<VoteControls onVote={vi.fn()} disabled jokers={quotas()} />)
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled())
  })
})
