import { ImageResponse } from 'next/og'

import { OgCard } from '@/components/og/og-card'
import { getSessionPreview } from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import { parseInviteIdentifier } from '@/domain/share'
import { countLabel, displayPseudo } from '@/lib/format'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Invitation à voter sur onmangekoi'

export default async function InviteOpenGraphImage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const [{ code }, supabase] = await Promise.all([params, createServerClient()])
  const identifier = parseInviteIdentifier(code)
  const preview =
    identifier.kind === 'invalid'
      ? null
      : await getSessionPreview(supabase, identifier.value).catch(() => null)

  return new ImageResponse(
    preview ? (
      <OgCard
        eyebrow={`${displayPseudo(preview.host_pseudo)} t’invite`}
        title={preview.name}
        subtitle={`${countLabel(preview.restaurant_count, 'resto')} à départager. Vote en deux minutes.`}
        footer="Sans compte"
      />
    ) : (
      <OgCard
        eyebrow="Invitation"
        title="Où est-ce qu’on mange ?"
        subtitle="Rejoins la session et vote sur les restos."
      />
    ),
    size
  )
}
