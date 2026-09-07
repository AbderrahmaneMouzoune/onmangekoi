// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { useRovingFocus } from './use-roving-focus'

function Group({ onMove }: { onMove?: (index: number) => void }) {
  const onKeyDown = useRovingFocus(onMove)
  return (
    <div role="radiogroup" aria-label="Budget" onKeyDown={onKeyDown}>
      <button type="button" role="radio" aria-checked="true" data-roving tabIndex={0}>
        Un
      </button>
      <button type="button" role="radio" aria-checked="false" data-roving tabIndex={-1}>
        Deux
      </button>
      <button type="button" role="radio" aria-checked="false" data-roving tabIndex={-1} disabled>
        Trois
      </button>
      <button type="button" role="radio" aria-checked="false" data-roving tabIndex={-1}>
        Quatre
      </button>
    </div>
  )
}

describe('useRovingFocus', () => {
  it('should move the focus with the arrows, skipping disabled items and looping', async () => {
    const onMove = vi.fn()
    render(<Group onMove={onMove} />)
    const [un, deux, , quatre] = screen.getAllByRole('radio')

    un.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(deux).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(quatre).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(un).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(quatre).toHaveFocus()

    // Les index renvoyés comptent parmi les éléments activables
    expect(onMove.mock.calls.map((call) => call[0])).toEqual([1, 2, 0, 2])
  })

  it('should jump to the edges with Home and End', async () => {
    render(<Group />)
    const [un, deux, , quatre] = screen.getAllByRole('radio')

    deux.focus()
    await userEvent.keyboard('{End}')
    expect(quatre).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(un).toHaveFocus()
  })

  it('should leave other keys alone', async () => {
    render(<Group />)
    const [un] = screen.getAllByRole('radio')
    un.focus()
    await userEvent.keyboard('{Tab}')
    expect(un).not.toHaveFocus()
  })
})
