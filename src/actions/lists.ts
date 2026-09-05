'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { ROUTE_PATTERNS, router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import {
  addRestaurantsToList,
  addRestaurantsToSharedList,
  copySharedList,
  deleteList,
  removeRestaurantFromList,
  updateList,
} from '@/data-access/lists'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/domain/errors'
import { CreateListSchema, SharedListActionSchema, UpdateListSchema } from '@/domain/schemas/list'
import { createListUseCase } from '@/use-cases/create-list'

import type { ActionResult, FormState } from './types'
import type { List } from '@/data-access/models'

const RestaurantIdsSchema = z.array(z.uuid()).min(1).max(100)

async function requireUser() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  return { supabase, user }
}

export async function createListAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = CreateListSchema.safeParse({
    name: formData.get('name'),
    restaurantIds: formData.getAll('restaurantIds'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide' }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { error: 'Tu dois d’abord choisir un pseudo.' }

  let list: List
  try {
    list = await createListUseCase(supabase, user.id, parsed.data)
  } catch (error) {
    return { error: toUserMessage(error) }
  }

  revalidatePath(router.lists())
  redirect(router.list(list))
}

export async function renameListAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = UpdateListSchema.safeParse({
    listId: formData.get('listId'),
    name: formData.get('name'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Nom invalide' }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { error: 'Non authentifié' }

  try {
    await updateList(supabase, parsed.data.listId, { name: parsed.data.name })
  } catch (error) {
    return { error: toUserMessage(error) }
  }

  revalidatePath(ROUTE_PATTERNS.list, 'page')
  revalidatePath(ROUTE_PATTERNS.sharedList, 'page')
  revalidatePath(router.lists())
  return { success: 'Liste renommée.' }
}

export async function setListCollaborativeAction(
  listId: string,
  isCollaborative: boolean
): Promise<ActionResult> {
  const parsed = UpdateListSchema.safeParse({ listId, isCollaborative })
  if (!parsed.success) return { ok: false, error: 'Liste invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  let list: List
  try {
    list = await updateList(supabase, parsed.data.listId, {
      is_collaborative: parsed.data.isCollaborative,
    })
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(router.list(list))
  return { ok: true, data: undefined }
}

export async function deleteListAction(listId: string): Promise<ActionResult> {
  const parsed = UpdateListSchema.safeParse({ listId })
  if (!parsed.success) return { ok: false, error: 'Liste invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await deleteList(supabase, parsed.data.listId)
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(router.lists())
  redirect(router.lists())
}

/** Ajoute plusieurs restaurants en un seul aller-retour. */
export async function addRestaurantsToListAction(
  listId: string,
  restaurantIds: string[]
): Promise<ActionResult> {
  const parsedId = z.uuid().safeParse(listId)
  const parsedIds = RestaurantIdsSchema.safeParse(restaurantIds)
  if (!parsedId.success || !parsedIds.success) return { ok: false, error: 'Requête invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await addRestaurantsToList(supabase, parsedId.data, parsedIds.data)
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(ROUTE_PATTERNS.list, 'page')
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
  if (!parsed.success) return { ok: false, error: 'Requête invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await removeRestaurantFromList(supabase, parsed.data.listId, parsed.data.restaurantId)
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(ROUTE_PATTERNS.list, 'page')
  return { ok: true, data: undefined }
}

/** Ajoute plusieurs restaurants à une liste partagée (collaborative) en parallèle. */
export async function addToSharedListAction(
  identifier: string,
  restaurantIds: string[]
): Promise<ActionResult> {
  const parsed = SharedListActionSchema.safeParse({ identifier })
  const parsedIds = RestaurantIdsSchema.safeParse(restaurantIds)
  if (!parsed.success || !parsedIds.success) return { ok: false, error: 'Requête invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await addRestaurantsToSharedList(supabase, parsed.data.identifier, parsedIds.data)
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(ROUTE_PATTERNS.sharedList, 'page')
  return { ok: true, data: undefined }
}

export async function copySharedListAction(identifier: string): Promise<ActionResult> {
  const parsed = SharedListActionSchema.safeParse({ identifier })
  if (!parsed.success) return { ok: false, error: 'Lien invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  let list: List
  try {
    list = await copySharedList(supabase, parsed.data.identifier)
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(router.lists())
  redirect(router.list(list))
}
