'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'

import { ROUTE_PATTERNS, router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import {
  addRestaurantsToList,
  addRestaurantsToSharedList,
  copySharedList,
  deleteList,
  getListShareCode,
  removeRestaurantFromList,
  updateList,
} from '@/data-access/lists'
import { PUBLIC_LISTS_CACHE_TAG, publicListCacheTag } from '@/data-access/public-lists'
import { createServerClient } from '@/data-access/supabase/server'
import { CreateListSchema, SharedListActionSchema, UpdateListSchema } from '@/domain/schemas/list'
import {
  errorMessage,
  revalidateLocalizedPath,
  translateError,
  translateIssue,
} from '@/i18n/server'
import { createListUseCase } from '@/use-cases/create-list'
import { startSessionFromListUseCase } from '@/use-cases/start-session-from-list'

import type { ActionResult, FormState } from './types'
import type { List, Session } from '@/data-access/models'

const RestaurantIdsSchema = z.array(z.uuid()).min(1).max(100)

async function requireUser() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  return { supabase, user }
}

/**
 * Purge la page publique d'une liste après une écriture. Ce cache est partagé
 * par tous les visiteurs : sans ça, une liste publique montrerait pendant une
 * heure le contenu d'avant — ou survivrait à sa propre suppression.
 *
 * Purger une liste restée privée ne coûte rien et évite d'avoir à le savoir :
 * l'entrée est simplement absente.
 */
function revalidatePublicList(shareCode: string | null, options?: { sitemap?: boolean }): void {
  if (!shareCode) return
  // `updateTag` et non `revalidateTag(tag, profil)` : ce dernier sert encore
  // l'entrée périmée à la visite suivante. Un visiteur passé quand la liste
  // était privée continuerait de se voir refuser la page — ou, à l'inverse,
  // une liste refermée resterait lisible une fois de plus.
  updateTag(publicListCacheTag(shareCode))
  // Le sitemap ne bouge que lorsqu'une liste entre ou sort de la liste
  // publique — pas à chaque resto ajouté.
  if (options?.sitemap) updateTag(PUBLIC_LISTS_CACHE_TAG)
}

export async function createListAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = CreateListSchema.safeParse({
    name: formData.get('name'),
    restaurantIds: formData.getAll('restaurantIds'),
  })
  if (!parsed.success) {
    return {
      error: await translateIssue(parsed.error.issues[0], await errorMessage('invalid_form')),
    }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { error: await errorMessage('not_authenticated') }

  let list: List
  try {
    list = await createListUseCase(supabase, user.id, parsed.data)
  } catch (error) {
    return { error: await translateError(error) }
  }

  revalidateLocalizedPath(router.lists())
  redirect(router.list(list))
}

export async function renameListAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = UpdateListSchema.safeParse({
    listId: formData.get('listId'),
    name: formData.get('name'),
  })
  if (!parsed.success) {
    return {
      error: await translateIssue(parsed.error.issues[0], await errorMessage('invalid_form')),
    }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { error: await errorMessage('not_authenticated') }

  let list: List
  try {
    list = await updateList(supabase, parsed.data.listId, { name: parsed.data.name })
  } catch (error) {
    return { error: await translateError(error) }
  }

  revalidatePublicList(list.share_code)
  revalidateLocalizedPath(ROUTE_PATTERNS.list, 'page')
  revalidateLocalizedPath(ROUTE_PATTERNS.sharedList, 'page')
  revalidateLocalizedPath(router.lists())
  const t = await getTranslations('lists.editor')
  return { success: t('renamed') }
}

export async function setListCollaborativeAction(
  listId: string,
  isCollaborative: boolean
): Promise<ActionResult> {
  const parsed = UpdateListSchema.safeParse({ listId, isCollaborative })
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_list') }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  let list: List
  try {
    list = await updateList(supabase, parsed.data.listId, {
      is_collaborative: parsed.data.isCollaborative,
    })
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateLocalizedPath(router.list(list))
  return { ok: true, data: undefined }
}

/**
 * Ouvre — ou referme — la vitrine publique d'une liste. Les deux sens comptent
 * autant : le partage est opt-in, et il se retire d'un clic.
 *
 * Les lectures publiques sont mises en cache et partagées par tout le monde ;
 * refermer doit donc les purger sur-le-champ, sinon la page survivrait une
 * heure à la décision. Le sitemap partage le même sort, par son propre tag.
 */
export async function setListPublicAction(
  listId: string,
  isPublic: boolean
): Promise<ActionResult> {
  const parsed = UpdateListSchema.safeParse({ listId, isPublic })
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_list') }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  let list: List
  try {
    list = await updateList(supabase, parsed.data.listId, { is_public: parsed.data.isPublic })
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidatePublicList(list.share_code, { sitemap: true })
  revalidateLocalizedPath(router.list(list))
  revalidateLocalizedPath(router.sharedList(list))
  return { ok: true, data: undefined }
}

export async function deleteListAction(listId: string): Promise<ActionResult> {
  const parsed = UpdateListSchema.safeParse({ listId })
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_list') }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  let shareCode: string | null
  try {
    // Lu avant la suppression : après, plus rien ne dit quelle page publique
    // purger.
    shareCode = await getListShareCode(supabase, parsed.data.listId)
    await deleteList(supabase, parsed.data.listId)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidatePublicList(shareCode, { sitemap: true })
  revalidateLocalizedPath(router.lists())
  redirect(router.lists())
}

/** Ajoute plusieurs restaurants en un seul aller-retour. */
export async function addRestaurantsToListAction(
  listId: string,
  restaurantIds: string[]
): Promise<ActionResult> {
  const parsedId = z.uuid().safeParse(listId)
  const parsedIds = RestaurantIdsSchema.safeParse(restaurantIds)
  if (!parsedId.success || !parsedIds.success)
    return { ok: false, error: await errorMessage('invalid_request') }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    await addRestaurantsToList(supabase, parsedId.data, parsedIds.data)
    revalidatePublicList(await getListShareCode(supabase, parsedId.data))
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateLocalizedPath(ROUTE_PATTERNS.list, 'page')
  return { ok: true, data: undefined }
}

export async function removeRestaurantFromListAction(
  listId: string,
  restaurantId: string
): Promise<ActionResult> {
  const parsed = z.object({ listId: z.uuid(), restaurantId: z.uuid() }).safeParse({
    listId,
    restaurantId,
  })
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_request') }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    await removeRestaurantFromList(supabase, parsed.data.listId, parsed.data.restaurantId)
    revalidatePublicList(await getListShareCode(supabase, parsed.data.listId))
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateLocalizedPath(ROUTE_PATTERNS.list, 'page')
  return { ok: true, data: undefined }
}

/** Ajoute plusieurs restaurants à une liste partagée (collaborative) en parallèle. */
export async function addToSharedListAction(
  identifier: string,
  restaurantIds: string[]
): Promise<ActionResult> {
  const parsed = SharedListActionSchema.safeParse({ identifier })
  const parsedIds = RestaurantIdsSchema.safeParse(restaurantIds)
  if (!parsed.success || !parsedIds.success)
    return { ok: false, error: await errorMessage('invalid_request') }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  try {
    await addRestaurantsToSharedList(supabase, parsed.data.identifier, parsedIds.data)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidatePublicList(parsed.data.identifier)
  revalidateLocalizedPath(ROUTE_PATTERNS.sharedList, 'page')
  return { ok: true, data: undefined }
}

export async function copySharedListAction(identifier: string): Promise<ActionResult> {
  const parsed = SharedListActionSchema.safeParse({ identifier })
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_link') }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  let list: List
  try {
    list = await copySharedList(supabase, parsed.data.identifier)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateLocalizedPath(router.lists())
  redirect(router.list(list))
}

/**
 * « Lancer une session depuis cette liste » : la porte d'entrée de qui reçoit
 * le lien. Sans pseudo, le bouton n'appelle pas cette action — il passe par
 * l'onboarding et revient ici, comme `/join/<code>`.
 */
export async function startSessionFromListAction(identifier: string): Promise<ActionResult> {
  const parsed = SharedListActionSchema.safeParse({ identifier })
  if (!parsed.success) return { ok: false, error: await errorMessage('invalid_link') }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: await errorMessage('not_authenticated') }

  let session: Session
  try {
    session = await startSessionFromListUseCase(supabase, parsed.data.identifier)
  } catch (error) {
    return { ok: false, error: await translateError(error) }
  }

  revalidateLocalizedPath(router.home())
  redirect(router.session(session))
}
