// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuPopup,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu'

function Menu({ onAction = vi.fn() }: { onAction?: () => void }) {
  return (
    <DropdownMenuRoot>
      <DropdownMenuTrigger>Raccourcis</DropdownMenuTrigger>
      <DropdownMenuPopup>
        <DropdownMenuLinkItem render={<a href="/account" />}>Mon compte</DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onAction}>Se déconnecter</DropdownMenuItem>
      </DropdownMenuPopup>
    </DropdownMenuRoot>
  )
}

describe('DropdownMenu', () => {
  it('should stay closed until the trigger is activated', async () => {
    render(<Menu />)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Raccourcis' }))
    // Le menu emprunte son nom au déclencheur : rien à réécrire à la main.
    expect(await screen.findByRole('menu', { name: 'Raccourcis' })).toBeInTheDocument()
  })

  it('should announce the trigger as opening a menu', async () => {
    render(<Menu />)
    const trigger = screen.getByRole('button', { name: 'Raccourcis' })

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)
    await screen.findByRole('menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('should offer a destination as a link and an action as a plain item', async () => {
    render(<Menu />)
    await userEvent.click(screen.getByRole('button', { name: 'Raccourcis' }))

    const link = await screen.findByRole('menuitem', { name: 'Mon compte' })
    expect(link).toHaveAttribute('href', '/account')
    expect(screen.getByRole('menuitem', { name: 'Se déconnecter' })).not.toHaveAttribute('href')
  })

  it('should run the action and close the menu on activation', async () => {
    const onAction = vi.fn()
    render(<Menu onAction={onAction} />)
    await userEvent.click(screen.getByRole('button', { name: 'Raccourcis' }))

    await userEvent.click(await screen.findByRole('menuitem', { name: 'Se déconnecter' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('should open on the keyboard and give the focus back on escape', async () => {
    render(<Menu />)
    const trigger = screen.getByRole('button', { name: 'Raccourcis' })

    trigger.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(await screen.findByRole('menuitem', { name: 'Mon compte' })).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
