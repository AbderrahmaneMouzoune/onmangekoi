import { createHash, timingSafeEqual } from 'node:crypto'

import { createAdminClient } from '@/data-access/supabase/admin'
import { isWebPushConfigured } from '@/data-access/web-push'
import { PushDispatchSchema } from '@/domain/schemas/push'
import { env } from '@/env'
import { dispatchSessionPushUseCase } from '@/use-cases/dispatch-session-push'

/**
 * `POST /api/push/dispatch` — envoi des notifications push d'une session
 * (issue #7).
 *
 * Personne ne l'appelle depuis un navigateur : c'est la base qui le fait, par
 * `pg_net`, quand une session est lancée ou close (trigger
 * `notify_session_status_change`). D'où une authentification par secret
 * partagé plutôt que par cookie : `Authorization: Bearer <PUSH_DISPATCH_SECRET>`,
 * le même secret que `push_dispatch_secret` dans le Vault de Supabase.
 *
 * Réponses :
 *  - 401 : secret absent, faux, ou non configuré ici ;
 *  - 400 : corps illisible ;
 *  - 204 : notifications non configurées sur ce déploiement (VAPID ou clé
 *    secrète Supabase manquante) — l'appel est accepté, rien ne part ;
 *  - 200 : le compte rendu de l'envoi (`sent`, `purged`, `failed`).
 *
 * La route n'est pas sous le proxy (son `matcher` ne couvre pas `/api/`) et
 * le service worker ne la touche pas (`sw-routing.ts` : `/api/` et tout ce
 * qui n'est pas `GET` passent au réseau).
 */
export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request.headers.get('authorization'))) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const parsed = PushDispatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin || !isWebPushConfigured()) return new Response(null, { status: 204 })

  try {
    const report = await dispatchSessionPushUseCase(admin, parsed.data)
    return Response.json(report)
  } catch (error) {
    console.error('push: envoi impossible', error)
    return Response.json({ error: 'Envoi impossible' }, { status: 500 })
  }
}

/**
 * Compare le secret à temps constant. Les deux côtés passent d'abord par
 * SHA-256 : `timingSafeEqual` exige deux tampons de même longueur, et
 * comparer les longueurs d'abord révélerait celle du secret.
 */
function isAuthorized(header: string | null): boolean {
  const secret = env.PUSH_DISPATCH_SECRET
  if (!secret || !header?.startsWith('Bearer ')) return false

  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(header.slice('Bearer '.length)), digest(secret))
}
