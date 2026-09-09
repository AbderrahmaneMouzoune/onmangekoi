// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog'

function Dialog() {
  return (
    <AlertDialogRoot>
      <AlertDialogTrigger>Supprimer mon compte</AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogTitle>Supprimer mon compte ?</AlertDialogTitle>
        <AlertDialogDescription>Cette action est définitive.</AlertDialogDescription>
        <AlertDialogClose>Annuler</AlertDialogClose>
      </AlertDialogPopup>
    </AlertDialogRoot>
  )
}

describe('AlertDialog', () => {
  it('should take its accessible name from the title and its description', async () => {
    const user = userEvent.setup()
    render(<Dialog />)

    await user.click(screen.getByRole('button', { name: 'Supprimer mon compte' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Supprimer mon compte ?' })
    expect(dialog).toHaveAccessibleDescription('Cette action est définitive.')
  })

  it('should move the focus inside and give it back on close', async () => {
    const user = userEvent.setup()
    render(<Dialog />)
    const trigger = screen.getByRole('button', { name: 'Supprimer mon compte' })

    await user.click(trigger)
    const close = await screen.findByRole('button', { name: 'Annuler' })
    expect(close.closest('[role="alertdialog"]')).not.toBeNull()

    await user.click(close)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
