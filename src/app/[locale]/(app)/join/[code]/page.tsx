import { getTranslations } from 'next-intl/server'
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
  const [{ code }, supabase, t, tCommon] = await Promise.all([
    params,
    createServerClient(),
    getTranslations('metadata'),
    getTranslations('common'),
  ])
  const identifier = parseInviteIdentifier(code)
  const preview =
    identifier.kind === 'invalid'
      ? null
      : await getSessionPreview(supabase, identifier.value).catch(() => null)

  if (!preview) return { title: t('titles.invitation') }

  const host = displayPseudo(preview.host_pseudo, tCommon('people.guest'))
  const rules = parseSessionRules(preview.rules)
  const open = isOpenSession(rules)
  if (isDuoSession(rules)) {
    // Un duo (#61) : un lien envoyé à une seule personne, pas un groupe.
    return {
      title: t('invite.duoTitle', { host }),
      description: t('invite.duoDescription', { host }),
      openGraph: {
        title: t('invite.duoTitle', { host }),
        description: t('invite.duoOgDescription'),
      },
    }
  }
  return {
    title: t('invite.title', { name: preview.name }),
    description: open ? t('invite.openDescription', { host }) : t('invite.description', { host }),
    openGraph: {
      title: t('invite.ogTitle', { host, name: preview.name }),
      description: open ? t('invite.openOgDescription') : t('invite.ogDescription'),
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
