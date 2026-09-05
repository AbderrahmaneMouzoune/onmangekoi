// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { VoteControls } from './vote-controls'

describe('VoteControls', () => {
  it('should render the four vote actions', () => {
    render(<VoteControls onVote={vi.fn()} superlikeUsed={false} superDislikeUsed={false} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(4)
    expect(screen.getByRole('button', { name: /veto/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /coup de cœur/i })).toBeEnabled()
  })

  it('should call onVote with the value of the pressed action', async () => {
    const onVote = vi.fn()
    render(<VoteControls onVote={onVote} superlikeUsed={false} superDislikeUsed={false} />)
    await userEvent.click(screen.getByRole('button', { name: /ça me va/i }))
    await userEvent.click(screen.getByRole('button', { name: /bof/i }))
    await userEvent.click(screen.getByRole('button', { name: /coup de cœur/i }))
    await userEvent.click(screen.getByRole('button', { name: /veto/i }))
    expect(onVote.mock.calls.map((call) => call[0])).toEqual([1, 0, 2, -2])
  })

  it('should disable a joker once it has been used', () => {
    render(<VoteControls onVote={vi.fn()} superlikeUsed superDislikeUsed={false} />)
    expect(screen.getByRole('button', { name: /coup de cœur/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /veto/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /coup de cœur/i })).toHaveTextContent(/utilisé/)
  })

  it('should disable everything while a vote is in flight', () => {
    render(
      <VoteControls onVote={vi.fn()} disabled superlikeUsed={false} superDislikeUsed={false} />
    )
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled())
  })
})
