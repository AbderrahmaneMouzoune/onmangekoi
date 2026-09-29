import { Suspense } from 'react'

import { Shell } from '@/components/layout/shell'
import { JoinByCode, JoinByCodeFallback } from '@/components/session/join-by-code'
import { getSessionPreview } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { isDuoSession, isOpenSession, parseSessionRules } from '@/domain/session-rules'
import { parseInviteIdentifier } from '@/domain/share'
import { displayPseudo } from '@/lib/format'

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ code }, supabase] = await Promise.all([params, createServerClient()])
  const identifier = parseInviteIdentifier(code)
  const preview =
    identifier.kind === 'invalid'
      ? null
      : await getSessionPreview(supabase, identifier.value).catch(() => null)

  if (!preview) return { title: 'Invitation' }

  const host = displayPseudo(preview.host_pseudo)
  const rules = parseSessionRules(preview.rules)
  const open = isOpenSession(rules)
  if (isDuoSession(rules)) {
    // Un duo (#61) : un lien envoyé à une seule personne, pas un groupe.
    return {
      title: `${host} te propose de décider à deux`,
      description: `${host} t’invite à choisir où manger à deux : au premier « ça me va » commun, c’est décidé. Sans compte.`,
      openGraph: {
        title: `${host} te propose de décider à deux`,
        description:
          'Vous balayez les mêmes restos : au premier « ça me va » commun, c’est décidé.',
      },
    }
  }
  return {
    title: `Rejoins « ${preview.name} »`,
    description: open
      ? `${host} t’invite à choisir où manger. Vote quand tu veux avant la clôture, sans compte.`
      : `${host} t’invite à choisir où manger. Vote en deux minutes, sans compte.`,
    openGraph: {
      title: `${host} t’invite : ${preview.name}`,
      description: open
        ? 'Session ouverte : chacun vote à son heure, le classement tombe à la clôture.'
        : 'Vote sur les restos, le classement tranche.',
    },
  }
}

/**
 * Join direct par lien (`/join/7K3M9P`), code ou QR : idempotent. Sans pseudo,
 * le proxy a envoyé l'invité sur /setup avec ce chemin en `next`, et il revient
 * ici. Les anciens liens à jeton long restent acceptés.
 */
export default function JoinByCodePage({ params }: Props) {
  return (
    <Shell className="justify-center">
      <Suspense fallback={<JoinByCodeFallback />}>
        <JoinByCode params={params} />
      </Suspense>
    </Shell>
  )
}
