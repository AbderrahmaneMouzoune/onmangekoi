'use client'

import { RiHeartsLine, RiShareForwardLine } from '@remixicon/react'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { isWaitingForPartner, partnerOf } from '@/domain/duo'
import { useCanShare } from '@/hooks/use-can-share'
import { captureEvent } from '@/lib/analytics/client'
import { displayPseudo } from '@/lib/format'

import type { ParticipantWithProfile } from '@/data-access/models'
import type { ShareMethod } from '@/lib/analytics/events'

interface DuoPanelProps {
  sessionId: string
  sessionName: string
  participants: ParticipantWithProfile[]
  meId: string
  /** Lien d'invitation absolu, calculé côté serveur */
  inviteUrl: string
}

/**
 * Ce qui tient lieu de salle d'attente à un duo (#61) : un lien à envoyer,
 * pas de code à dicter. Tant que l'autre n'est pas là, l'invitation est en
 * tête — mais le deck reste juste en dessous, on vote sans l'attendre. Une
 * fois à deux, il ne reste qu'une ligne pour rappeler la règle : le premier
 * « ça me va » commun décide.
 */
export function DuoPanel({ sessionId, sessionName, participants, meId, inviteUrl }: DuoPanelProps) {
  const canShare = useCanShare()
  const partner = partnerOf(participants, meId)

  function trackShare(method: ShareMethod) {
    captureEvent('invite_shared', { session_id: sessionId, method })
  }

  async function share() {
    try {
      await navigator.share({
        title: `« ${sessionName} » sur onmangekoi`,
        text: 'On choisit où manger à deux : balaie les restos, au premier « ça me va » commun, c’est décidé.',
        url: inviteUrl,
      })
      trackShare('native_share')
    } catch {
      // Partage annulé par l'utilisateur
    }
  }

  if (!isWaitingForPartner(participants)) {
    return (
      <p className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-2">
        <RiHeartsLine aria-hidden="true" className="size-4.5 shrink-0 text-brand" />
        <span>
          À deux avec{' '}
          <strong className="font-semibold">{displayPseudo(partner?.profiles?.pseudo)}</strong> : au
          premier « ça me va » commun, c’est décidé.
        </span>
      </p>
    )
  }

  return (
    <section
      aria-labelledby="duo-invite-title"
      className="flex flex-col gap-4 rounded-lg chalkboard p-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:p-6"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="duo-invite-title" className="font-display text-xl font-bold text-chalk">
          Envoie ce lien
        </h2>
        <p className="max-w-prose text-sm text-chalk-muted">
          Pas de code à dicter : l’autre ouvre le lien et tombe directement sur les mêmes restos. Tu
          peux commencer à voter sans l’attendre — au premier « ça me va » commun, c’est décidé.
        </p>
      </div>

      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        {canShare && (
          <Button type="button" onClick={share}>
            <RiShareForwardLine aria-hidden="true" />
            Envoyer le lien
          </Button>
        )}
        <CopyButton
          value={inviteUrl}
          label="Copier le lien"
          variant="chalk"
          onCopied={() => trackShare('link_copy')}
        />
      </div>
    </section>
  )
}
