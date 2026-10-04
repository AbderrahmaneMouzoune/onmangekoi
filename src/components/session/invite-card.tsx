'use client'

import { RiCloseLine, RiShareForwardLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { InviteCode } from '@/components/session/invite-code'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import {
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
  const t = useTranslations('session.invite')

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
        title: t('shareTitle', { name: sessionName }),
        text: t('shareText'),
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
      className="flex flex-col gap-5 rounded-lg chalkboard p-5 lg:sticky lg:top-24 lg:p-6"
    >
      <div className="flex flex-col gap-3">
        <p
          id="invite-title"
          className="font-mono text-[0.7rem] tracking-[0.12em] text-chalk-muted uppercase"
        >
          {t('title')}
        </p>
        <InviteCode code={inviteCode} />
        <p className="text-sm text-chalk-muted">{t('howTo')}</p>
      </div>

      {qrSvg && (
        <DialogRoot>
          <div className="flex items-center gap-4 rounded-md bg-chalk/6 p-3">
            {/* Un QR de 7 cm de large se scanne mal à bout de bras : le sortir
                en plein écran est le seul geste utile qu'il porte. */}
            <DialogTrigger
              aria-label={t('enlarge')}
              className="size-28 shrink-0 cursor-zoom-in rounded-sm transition-transform outline-none hover:scale-[1.03] focus-visible:ring-3 focus-visible:ring-chalk/40 lg:size-36"
            >
              <span
                aria-hidden="true"
                className="block size-full [&>svg]:size-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            </DialogTrigger>
            <p className="text-sm text-chalk-muted">{t('qrHint')}</p>
          </div>

          <DialogPopup className="items-center chalkboard bg-slate ring-chalk/15">
            <DialogTitle className="text-chalk">{t('dialogTitle')}</DialogTitle>
            <DialogDescription className="text-center text-chalk-muted">
              {t('dialogDescription')}
            </DialogDescription>
            <div
              role="img"
              aria-label={t('qrLabel')}
              className="w-full max-w-72 [&>svg]:size-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <InviteCode code={inviteCode} className="w-full max-w-72" />
            <DialogClose
              render={
                <Button type="button" variant="chalk" className="w-full max-w-72">
                  <RiCloseLine aria-hidden="true" />
                  {t('close')}
                </Button>
              }
            />
          </DialogPopup>
        </DialogRoot>
      )}

      <div className="grid grid-cols-2 gap-2">
        <CopyButton
          value={inviteCode}
          label={t('copyCode')}
          variant="chalk"
          onCopied={() => trackShare('code_copy')}
        />
        <CopyButton
          value={inviteUrl}
          label={t('copyLink')}
          variant="chalk"
          onCopied={() => trackShare('link_copy')}
        />
        {canShare && (
          <Button type="button" variant="default" className="col-span-2" onClick={share}>
            <RiShareForwardLine aria-hidden="true" />
            {t('send')}
          </Button>
        )}
      </div>
    </section>
  )
}
