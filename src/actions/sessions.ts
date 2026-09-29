'use server'

import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { ROUTE_PATTERNS, router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { PUBLIC_RESULTS_CACHE_PROFILE, publicResultsCacheTag } from '@/data-access/public-results'
import {
  addSessionRestaurants,
  closeSession,
  confirmDecision,
  createRunoffSession,
  deleteSession,
  drawTiebreakWinner,
  extendSession,
  launchSession,
  leaveSession,
  removeSessionRestaurant,
  setResultsPublic,
} from '@/data-access/sessions'
import { createServerClient } from '@/data-access/supabase/server'
import {
  AddSessionRestaurantsSchema,
  CreateSessionSchema,
  JoinSessionSchema,
  SessionIdSchema,
  SessionRestaurantSchema,
} from '@/domain/schemas/session'
import { EXTEND_MINUTES } from '@/domain/session-deadline'
import { revalidateLocalizedPath, translateError, translateIssue } from '@/i18n/server'
import { createSessionUseCase } from '@/use-cases/create-session'
import { joinSessionUseCase } from '@/use-cases/join-session'

import type { ActionResult, FormState } from './types'
import type { Session } from '@/data-access/models'

async function requireUser() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  return { supabase, user }
}

export async function createSessionAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = CreateSessionSchema.safeParse({
    name: formData.get('name'),
    listIds: formData.getAll('listIds'),
    restaurantIds: formData.getAll('restaurantIds'),
    groupIds: formData.getAll('groupIds'),
    closesInMinutes: formData.get('closesInMinutes'),
    closesAt: formData.get('closesAt'),
    superlikes: formData.get('superlikes'),
    vetos: formData.get('vetos'),
    closeAtRatio: formData.get('closeAtRatio'),
    open: formData.get('open'),
    duo: formData.get('duo'),
    excludeRecentWinners: formData.get('excludeRecentWinners'),
  })
  if (!parsed.success) {
    return { error: await translateIssue(parsed.error.issues[0], 'Formulaire invalide') }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { error: 'Tu dois d’abord choisir un pseudo.' }

  let session: Session
  try {
    session = await createSessionUseCase(supabase, parsed.data)
  } catch (error) {
    return { error: await translateError(error) }
  }

  revalidateLocalizedPath(router.home())
  redirect(router.session(session))
}

export async function joinSessionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = JoinSessionSchema.safeParse({ identifier: formData.get('identifier') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Code invalide' }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { error: 'Tu dois d’abord choisir un pseudo.' }

  let session: Session
  try {
    session = await joinSessionUseCase(supabase, parsed.data.identifier)
  } catch (error) {
    return { error: await translateError(error) }
  }

  revalidateLocalizedPath(router.home())
  redirect(router.session(session))
}

/**
 * Apporte des restaurants à une session en attente. Ouvert à tous ses
 * participants : la RPC revérifie en base l'appartenance et le statut.
 */
export async function addSessionRestaurantsAction(
  sessionId: string,
  restaurantIds: string[]
): Promise<ActionResult> {
  const parsed = AddSessionRestaurantsSchema.safeParse({ sessionId, restaurantIds })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Requête invalide' }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await addSessionRestaurants(supabase, parsed.data.sessionId, parsed.data.restaurantIds)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateLocalizedPath(ROUTE_PATTERNS.session, 'page')
  return { ok: true, data: undefined }
}

/** Retire un restaurant apporté — le sien, ou n'importe lequel quand on est host. */
export async function removeSessionRestaurantAction(
  sessionId: string,
  restaurantId: string
): Promise<ActionResult> {
  const parsed = SessionRestaurantSchema.safeParse({ sessionId, restaurantId })
  if (!parsed.success) return { ok: false, error: 'Requête invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await removeSessionRestaurant(supabase, parsed.data.sessionId, parsed.data.restaurantId)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateLocalizedPath(ROUTE_PATTERNS.session, 'page')
  return { ok: true, data: undefined }
}

export async function launchSessionAction(sessionId: string): Promise<ActionResult<Session>> {
  const id = SessionIdSchema.safeParse(sessionId)
  if (!id.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    const session = await launchSession(supabase, id.data)
    revalidateLocalizedPath(router.session(session))
    return { ok: true, data: session }
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }
}

export async function closeSessionAction(sessionId: string): Promise<ActionResult<Session>> {
  const id = SessionIdSchema.safeParse(sessionId)
  if (!id.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    const session = await closeSession(supabase, id.data)
    revalidateLocalizedPath(router.session(session))
    revalidateLocalizedPath(router.sessionResults(session))
    return { ok: true, data: session }
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }
}

export async function extendSessionAction(sessionId: string): Promise<ActionResult<Session>> {
  const id = SessionIdSchema.safeParse(sessionId)
  if (!id.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    const session = await extendSession(supabase, id.data, EXTEND_MINUTES)
    revalidateLocalizedPath(router.session(session))
    return { ok: true, data: session }
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }
}

/**
 * Second tour entre les ex æquo. Le classement du premier tour est revalidé
 * pour tout le monde : c'est là qu'apparaît le lien vers la suite.
 */
export async function createRunoffSessionAction(sessionId: string): Promise<ActionResult<Session>> {
  const id = SessionIdSchema.safeParse(sessionId)
  if (!id.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    const runoff = await createRunoffSession(supabase, id.data)
    // Le second tour est la seule chose qu'on récupère : le classement du
    // premier tour ne se connaît que par son id, d'où le motif de route.
    revalidateLocalizedPath(ROUTE_PATTERNS.sessionResults, 'page')
    revalidateLocalizedPath(router.home())
    return { ok: true, data: runoff }
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }
}

/** Tirage au sort entre les ex æquo — le résultat est décidé et gardé en base. */
export async function drawWinnerAction(sessionId: string): Promise<ActionResult<Session>> {
  const id = SessionIdSchema.safeParse(sessionId)
  if (!id.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  let session: Session
  try {
    session = await drawTiebreakWinner(supabase, id.data)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  // Le podium public, s'il est ouvert, doit lui aussi montrer le gagnant tiré.
  revalidateTag(publicResultsCacheTag(session.results_code), PUBLIC_RESULTS_CACHE_PROFILE)
  revalidateLocalizedPath(router.sessionResults(session))
  return { ok: true, data: session }
}

/**
 * « On y va » : le host confirme le restaurant où le groupe va — le gagnant
 * du vote, ou un autre de la session. La base vérifie le rôle, la clôture et
 * l'appartenance du restaurant ; les participants reçoivent la décision par
 * Realtime, comme la clôture.
 */
export async function confirmDecisionAction(
  sessionId: string,
  restaurantId: string
): Promise<ActionResult<Session>> {
  const parsed = SessionRestaurantSchema.safeParse({ sessionId, restaurantId })
  if (!parsed.success) return { ok: false, error: 'Restaurant invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  let session: Session
  try {
    session = await confirmDecision(supabase, parsed.data.sessionId, parsed.data.restaurantId)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  // Le lien public, s'il est ouvert, annonce désormais la décision ; et
  // l'historique la montre à la place du gagnant calculé.
  revalidateTag(publicResultsCacheTag(session.results_code), PUBLIC_RESULTS_CACHE_PROFILE)
  revalidateLocalizedPath(router.sessionResults(session))
  revalidateLocalizedPath(router.sessions())
  return { ok: true, data: session }
}

/**
 * Ouvre ou referme le lien public du classement. Le host décide, la base
 * vérifie — et on purge aussitôt l'entrée de cache du lien : quand quelqu'un
 * referme un partage, il s'attend à ce que ce soit immédiat, pas dans l'heure.
 */
export async function setResultsPublicAction(
  sessionId: string,
  isPublic: boolean
): Promise<ActionResult<Session>> {
  const id = SessionIdSchema.safeParse(sessionId)
  if (!id.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  let session: Session
  try {
    session = await setResultsPublic(supabase, id.data, isPublic)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateTag(publicResultsCacheTag(session.results_code), PUBLIC_RESULTS_CACHE_PROFILE)
  revalidateLocalizedPath(router.sessionResults(session))
  return { ok: true, data: session }
}

export async function leaveSessionAction(sessionId: string): Promise<ActionResult> {
  const id = SessionIdSchema.safeParse(sessionId)
  if (!id.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await leaveSession(supabase, id.data, user.id)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateLocalizedPath(router.home())
  redirect(router.home())
}

export async function deleteSessionAction(sessionId: string): Promise<ActionResult> {
  const id = SessionIdSchema.safeParse(sessionId)
  if (!id.success) return { ok: false, error: 'Session invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await deleteSession(supabase, id.data)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateLocalizedPath(router.home())
  redirect(router.home())
}
