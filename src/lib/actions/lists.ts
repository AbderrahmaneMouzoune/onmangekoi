'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  addRestaurantToSharedList,
  addRestaurantsToList,
  copySharedList,
  createList,
  deleteList,
  removeRestaurantFromList,
  updateList,
} from '@/data-access/lists'
import { createServerClient } from '@/data-access/supabase/server'
import { toUserMessage } from '@/lib/errors'
import {
  CreateListSchema,
  ListRestaurantSchema,
  SharedListActionSchema,
  UpdateListSchema,
} from '@/lib/schemas/list'

import type { ActionResult, FormState } from './types'

async function requireUser() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
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

  let listId: string
  try {
    const list = await createList(supabase, { name: parsed.data.name, ownerId: user.id })
    await addRestaurantsToList(supabase, list.id, parsed.data.restaurantIds)
    listId = list.id
  } catch (error) {
    return { error: toUserMessage(error) }
  }

  revalidatePath('/lists')
  redirect(`/lists/${listId}`)
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

  revalidatePath(`/lists/${parsed.data.listId}`)
  revalidatePath('/lists')
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

  try {
    await updateList(supabase, parsed.data.listId, {
      is_collaborative: parsed.data.isCollaborative,
    })
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(`/lists/${parsed.data.listId}`)
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

  revalidatePath('/lists')
  redirect('/lists')
}

export async function addRestaurantToListAction(
  listId: string,
  restaurantId: string
): Promise<ActionResult> {
  const parsed = ListRestaurantSchema.safeParse({ listId, restaurantId })
  if (!parsed.success) return { ok: false, error: 'Requête invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await addRestaurantsToList(supabase, parsed.data.listId, [parsed.data.restaurantId])
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(`/lists/${parsed.data.listId}`)
  return { ok: true, data: undefined }
}

export async function removeRestaurantFromListAction(
  listId: string,
  restaurantId: string
): Promise<ActionResult> {
  const parsed = ListRestaurantSchema.safeParse({ listId, restaurantId })
  if (!parsed.success) return { ok: false, error: 'Requête invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await removeRestaurantFromList(supabase, parsed.data.listId, parsed.data.restaurantId)
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(`/lists/${parsed.data.listId}`)
  return { ok: true, data: undefined }
}

export async function addToSharedListAction(
  token: string,
  restaurantId: string
): Promise<ActionResult> {
  const parsed = SharedListActionSchema.safeParse({ token, restaurantId })
  if (!parsed.success || !parsed.data.restaurantId) {
    return { ok: false, error: 'Requête invalide' }
  }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  try {
    await addRestaurantToSharedList(supabase, parsed.data.token, parsed.data.restaurantId)
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath(`/l/${parsed.data.token}`)
  return { ok: true, data: undefined }
}

export async function copySharedListAction(token: string): Promise<ActionResult> {
  const parsed = SharedListActionSchema.safeParse({ token })
  if (!parsed.success) return { ok: false, error: 'Lien invalide' }

  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  let listId: string
  try {
    const list = await copySharedList(supabase, parsed.data.token)
    listId = list.id
  } catch (error) {
    return { ok: false, error: toUserMessage(error) }
  }

  revalidatePath('/lists')
  redirect(`/lists/${listId}`)
}
