// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountMenu } from './account-menu'

const signOutAction = vi.hoisted(() => vi.fn())

vi.mock('@/actions/auth', () => ({ signOutAction }))

async function openMenu(props?: { isAnonymous?: boolean }) {
  render(<AccountMenu pseudo="Alex" isAnonymous={props?.isAnonymous ?? false} />)
  const trigger = screen.getByRole('button', { name: /alex/i })
  await userEvent.click(trigger)
  await screen.findByRole('menu')
  return trigger
}

describe('AccountMenu', () => {
  beforeEach(() => {
    signOutAction.mockReset()
    signOutAction.mockResolvedValue(undefined)
  })

  it('should open the menu instead of leaving the page', async () => {
    render(<AccountMenu pseudo="Alex" isAnonymous={false} />)

    // La pastille est un bouton, pas un lien : elle n'emmène nulle part.
    const trigger = screen.getByRole('button', { name: /alex/i })
    expect(trigger).not.toHaveAttribute('href')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(trigger)
    expect(await screen.findByRole('menu', { name: /alex/i })).toBeInTheDocument()
  })

  it('should keep the account page one click away, next to the lists', async () => {
    await openMenu()

    expect(screen.getByRole('menuitem', { name: 'Mon compte' })).toHaveAttribute('href', '/account')
    expect(screen.getByRole('menuitem', { name: 'Mes listes' })).toHaveAttribute('href', '/lists')
  })

  it('should confirm before signing out', async () => {
    await openMenu()

    await userEvent.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }))

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/se déconnecter \?/i)
    expect(signOutAction).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))
    expect(signOutAction).toHaveBeenCalledTimes(1)
  })

  it('should warn a guest that signing out loses their lists', async () => {
    await openMenu({ isAnonymous: true })
    await userEvent.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }))

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/seront perdues/i)
  })

  it('should stay signed in when the confirmation is dismissed', async () => {
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(signOutAction).not.toHaveBeenCalled()
  })
})
