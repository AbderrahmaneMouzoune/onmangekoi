// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { InviteCard } from './invite-card'

const QR_SVG = '<svg viewBox="0 0 8 8" role="presentation"><rect width="8" height="8" /></svg>'

function renderCard(qrSvg: string | null = QR_SVG) {
  return render(
    <InviteCard
      sessionId="33333333-3333-4333-8333-333333333333"
      inviteCode="ABC123"
      inviteUrl="https://onmangekoi.test/j/ABC123"
      sessionName="Lunch du vendredi"
      qrSvg={qrSvg}
    />
  )
}

describe('InviteCard', () => {
  it('should open the QR code full size when it is tapped', async () => {
    renderCard()
    expect(screen.queryByRole('img', { name: /QR code du lien/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /agrandir le qr code/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/scanner pour rejoindre/i)
    expect(screen.getByRole('img', { name: /QR code du lien/i })).toBeInTheDocument()
  })

  it('should close the enlarged QR code again', async () => {
    renderCard()
    await userEvent.click(screen.getByRole('button', { name: /agrandir le qr code/i }))
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByRole('button', { name: /^fermer$/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('should render no QR affordance without a QR code', () => {
    renderCard(null)
    expect(screen.queryByRole('button', { name: /agrandir le qr code/i })).not.toBeInTheDocument()
  })
})
