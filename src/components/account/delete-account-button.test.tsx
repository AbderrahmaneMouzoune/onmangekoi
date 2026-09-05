// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DELETE_CONFIRMATION, DeleteAccountButton } from './delete-account-button'

const deleteAccountAction = vi.hoisted(() => vi.fn())

vi.mock('@/lib/actions/account', () => ({ deleteAccountAction }))

async function openDialog() {
  render(<DeleteAccountButton />)
  await userEvent.click(screen.getByRole('button', { name: /supprimer mon compte/i }))
  return {
    field: screen.getByLabelText(new RegExp(DELETE_CONFIRMATION, 'i')),
    confirm: screen.getByRole('button', { name: /supprimer définitivement/i }),
  }
}

describe('DeleteAccountButton', () => {
  beforeEach(() => {
    deleteAccountAction.mockReset()
    deleteAccountAction.mockResolvedValue({ ok: true, data: undefined })
  })

  it('should ask to type the confirmation word before allowing the deletion', async () => {
    const { confirm } = await openDialog()
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/supprimer mon compte \?/i)
    expect(confirm).toBeDisabled()
  })

  it('should keep the deletion locked while the word does not match', async () => {
    const { field, confirm } = await openDialog()
    await userEvent.type(field, 'effac')
    expect(confirm).toBeDisabled()
    await userEvent.type(field, 'ement')
    expect(confirm).toBeDisabled()
    expect(deleteAccountAction).not.toHaveBeenCalled()
  })

  it('should accept the word whatever the case and the surrounding spaces', async () => {
    const { field, confirm } = await openDialog()
    await userEvent.type(field, ` ${DELETE_CONFIRMATION.toUpperCase()} `)
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    expect(deleteAccountAction).toHaveBeenCalledTimes(1)
  })

  it('should surface the error and keep the account when the deletion fails', async () => {
    deleteAccountAction.mockResolvedValue({
      ok: false,
      error: 'Impossible de supprimer le compte.',
    })
    const { field, confirm } = await openDialog()
    await userEvent.type(field, DELETE_CONFIRMATION)
    await userEvent.click(confirm)
    expect(await screen.findByRole('alert')).toHaveTextContent(/impossible de supprimer le compte/i)
  })

  it('should forget what was typed when the dialog is dismissed', async () => {
    const { field } = await openDialog()
    await userEvent.type(field, DELETE_CONFIRMATION)
    await userEvent.click(screen.getByRole('button', { name: /annuler/i }))

    await userEvent.click(screen.getByRole('button', { name: /supprimer mon compte/i }))
    expect(screen.getByLabelText(new RegExp(DELETE_CONFIRMATION, 'i'))).toHaveValue('')
    expect(screen.getByRole('button', { name: /supprimer définitivement/i })).toBeDisabled()
  })
})
