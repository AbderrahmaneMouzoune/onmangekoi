// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ArrowKeyList } from '@/components/ui/arrow-key-list'

function List({ orientation }: { orientation?: 'vertical' | 'horizontal' | 'both' }) {
  return (
    <ArrowKeyList aria-label="Sessions" orientation={orientation}>
      <li>
        <a href="/a">Un</a>
      </li>
      <li>
        <a href="/b">Deux</a>
      </li>
      <li>
        <button type="button" disabled>
          Trois
        </button>
      </li>
      <li>
        <button type="button">Quatre</button>
      </li>
    </ArrowKeyList>
  )
}

describe('useArrowNavigation', () => {
  it('should walk the list with up and down, skipping disabled items, without looping', async () => {
    const user = userEvent.setup()
    render(<List />)
    const un = screen.getByRole('link', { name: 'Un' })
    const deux = screen.getByRole('link', { name: 'Deux' })
    const quatre = screen.getByRole('button', { name: 'Quatre' })

    un.focus()
    await user.keyboard('{ArrowDown}')
    expect(deux).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(quatre).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(quatre).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}')
    expect(un).toHaveFocus()
  })

  it('should jump to the edges with Home and End', async () => {
    const user = userEvent.setup()
    render(<List />)
    screen.getByRole('link', { name: 'Deux' }).focus()

    await user.keyboard('{End}')
    expect(screen.getByRole('button', { name: 'Quatre' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('link', { name: 'Un' })).toHaveFocus()
  })

  it('should leave left and right alone in a vertical list', async () => {
    const user = userEvent.setup()
    render(<List />)
    const un = screen.getByRole('link', { name: 'Un' })
    un.focus()

    await user.keyboard('{ArrowRight}')
    expect(un).toHaveFocus()
  })

  it('should answer to every arrow in a wrapping list', async () => {
    const user = userEvent.setup()
    render(<List orientation="both" />)
    screen.getByRole('link', { name: 'Un' }).focus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('link', { name: 'Deux' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('link', { name: 'Un' })).toHaveFocus()
  })
})
