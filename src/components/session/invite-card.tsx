'use client'

import { RiShareForwardLine } from '@remixicon/react'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { useCanShare } from '@/hooks/use-can-share'
import { formatInviteCode } from '@/lib/invite'

interface InviteCardProps {
  inviteCode: string
  /** URL absolue calculée côté serveur (NEXT_PUBLIC_SITE_URL) */
  inviteUrl: string
  sessionName: string
}

export function InviteCard({ inviteCode, inviteUrl, sessionName }: InviteCardProps) {
  const canShare = useCanShare()

  async function share() {
    try {
      await navigator.share({
        title: `Rejoins « ${sessionName} » sur onmangekoi`,
        text: 'On vote pour choisir où manger, ça prend deux minutes.',
        url: inviteUrl,
      })
    } catch {
      // Partage annulé par l'utilisateur
    }
  }

  return (
    <section
      aria-labelledby="invite-title"
      className="flex flex-col gap-5 rounded-lg chalkboard p-5"
    >
      <div className="flex flex-col gap-1">
        <p
          id="invite-title"
          className="font-mono text-[0.7rem] tracking-[0.12em] text-chalk-muted uppercase"
        >
          Code d’invitation
        </p>
        <p className="font-mono text-[2.75rem] leading-none font-semibold tracking-[0.18em] tabular">
          {formatInviteCode(inviteCode)}
        </p>
        <p className="text-sm text-chalk-muted">À dire à voix haute, ou à envoyer en lien.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CopyButton value={inviteCode} label="Copier le code" variant="chalk" />
        <CopyButton value={inviteUrl} label="Copier le lien" variant="chalk" />
        {canShare && (
          <Button type="button" variant="default" className="col-span-2" onClick={share}>
            <RiShareForwardLine aria-hidden="true" />
            Envoyer l’invitation
          </Button>
        )}
      </div>
    </section>
  )
}
