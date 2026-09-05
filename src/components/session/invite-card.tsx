'use client'

import { RiShareForwardLine } from '@remixicon/react'
import { useEffect } from 'react'

import { InviteCode } from '@/components/session/invite-code'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { useCanShare } from '@/hooks/use-can-share'
import { captureEvent } from '@/lib/analytics/client'
import { markOnce } from '@/lib/analytics/handoff'

import type { ShareMethod } from '@/lib/analytics/events'

interface InviteCardProps {
  sessionId: string
  inviteCode: string
  /** URL absolue calculée côté serveur (variables Vercel ou NEXT_PUBLIC_SITE_URL) */
  inviteUrl: string
  sessionName: string
  /** QR code SVG du lien, généré côté serveur */
  qrSvg: string | null
}

export function InviteCard({
  sessionId,
  inviteCode,
  inviteUrl,
  sessionName,
  qrSvg,
}: InviteCardProps) {
  const canShare = useCanShare()

  function trackShare(method: ShareMethod) {
    captureEvent('invite_shared', { session_id: sessionId, method })
  }

  // Le QR code n'a pas d'action dédiée : son affichage vaut partage, compté
  // une seule fois par session pour ne pas gonfler à chaque rendu.
  useEffect(() => {
    if (!qrSvg) return
    if (!markOnce(`qr.${sessionId}`)) return
    captureEvent('invite_shared', { session_id: sessionId, method: 'qr' })
  }, [qrSvg, sessionId])

  async function share() {
    try {
      await navigator.share({
        title: `Rejoins « ${sessionName} » sur onmangekoi`,
        text: 'On vote pour choisir où manger, ça prend deux minutes.',
        url: inviteUrl,
      })
      trackShare('native_share')
    } catch {
      // Partage annulé par l'utilisateur
    }
  }

  return (
    <section
      aria-labelledby="invite-title"
      className="flex flex-col gap-5 rounded-lg chalkboard p-5"
    >
      <div className="flex flex-col gap-3">
        <p
          id="invite-title"
          className="font-mono text-[0.7rem] tracking-[0.12em] text-chalk-muted uppercase"
        >
          Code d’invitation
        </p>
        <InviteCode code={inviteCode} />
        <p className="text-sm text-chalk-muted">
          À dire à voix haute (majuscules et tirets sans importance), à faire scanner, ou à envoyer
          en lien.
        </p>
      </div>

      {qrSvg && (
        <div className="flex items-center gap-4 rounded-md bg-chalk/6 p-3">
          <div
            aria-label="QR code du lien d’invitation"
            role="img"
            className="size-28 shrink-0 [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="text-sm text-chalk-muted">
            Les autres scannent ce QR code avec l’appareil photo de leur téléphone, ou depuis « J’ai
            un code » dans l’app.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <CopyButton
          value={inviteCode}
          label="Copier le code"
          variant="chalk"
          onCopied={() => trackShare('code_copy')}
        />
        <CopyButton
          value={inviteUrl}
          label="Copier le lien"
          variant="chalk"
          onCopied={() => trackShare('link_copy')}
        />
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
