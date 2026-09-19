// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setShortcutsHelpOpen } from '@/lib/shortcuts-help-store'

import { KeyboardShortcuts } from './keyboard-shortcuts'

const push = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}))

describe('KeyboardShortcuts', () => {
  beforeEach(() => {
    push.mockReset()
    setShortcutsHelpOpen(false)
  })

  it('should open the new session page on n then s', async () => {
    const user = userEvent.setup()
    render(<KeyboardShortcuts />)

    await user.keyboard('ns')
    expect(push).toHaveBeenCalledWith('/sessions/new')
  })

  it('should open the new list page on n then l, and lists on g then l', async () => {
    const user = userEvent.setup()
    render(<KeyboardShortcuts />)

    await user.keyboard('nl')
    await user.keyboard('gl')
    expect(push.mock.calls.map((call) => call[0])).toEqual(['/lists/new', '/lists'])
  })

  it('should let a stray key start a new sequence', async () => {
    const user = userEvent.setup()
    render(<KeyboardShortcuts />)

    // « g » puis « n » : le « n » ne complète pas « g », il ouvre « n… ».
    await user.keyboard('gns')
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/sessions/new')
  })

  it('should ignore keys typed in a field', async () => {
    const user = userEvent.setup()
    render(
      <>
        <input aria-label="Nom" />
        <KeyboardShortcuts />
      </>
    )

    await user.click(screen.getByRole('textbox', { name: 'Nom' }))
    await user.keyboard('ns')
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Nom' })).toHaveValue('ns')
  })

  it('should ignore a letter held with a modifier', async () => {
    const user = userEvent.setup()
    render(<KeyboardShortcuts />)

    await user.keyboard('{Control>}n{/Control}s')
    expect(push).not.toHaveBeenCalled()
  })

  it('should open the help on ? and close it on Escape', async () => {
    const user = userEvent.setup()
    render(<KeyboardShortcuts />)

    await user.keyboard('?')
    const dialog = await screen.findByRole('dialog', { name: 'Raccourcis clavier' })
    expect(dialog).toHaveTextContent('Nouvelle session')
    expect(dialog).toHaveTextContent('Coup de cœur')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('should focus the search field on /', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">Ailleurs</button>
        <input type="search" aria-label="Chercher un restaurant" />
        <KeyboardShortcuts />
      </>
    )

    screen.getByRole('button', { name: 'Ailleurs' }).focus()
    await user.keyboard('/')
    expect(screen.getByRole('searchbox', { name: 'Chercher un restaurant' })).toHaveFocus()
    expect(screen.getByRole('searchbox', { name: 'Chercher un restaurant' })).toHaveValue('')
  })
})
