import { redirect } from 'next/navigation'

import { router } from '@/config/router.config'
import { exportMyData } from '@/data-access/account'
import { getCurrentUser } from '@/data-access/auth'
import { createServerClient } from '@/data-access/supabase/server'

/**
 * Portabilité des données (art. 20 RGPD) : un JSON téléchargeable, généré à la
 * demande. Le périmètre est décidé en base par `export_my_data()`, qui ne lit
 * que les lignes de `auth.uid()` — ce handler ne prend aucun paramètre, il n'y
 * a donc rien à falsifier depuis l'URL.
 */
export async function GET() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) redirect(router.setup(router.account()))

  let payload: string
  try {
    payload = JSON.stringify(await exportMyData(supabase), null, 2)
  } catch {
    return Response.json(
      { error: 'L’export a échoué. Réessaie dans un instant.' },
      { status: 500, headers: { 'cache-control': 'no-store' } }
    )
  }

  const day = new Date().toISOString().slice(0, 10)
  return new Response(payload, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="onmangekoi-mes-donnees-${day}.json"`,
      'cache-control': 'no-store',
    },
  })
}
