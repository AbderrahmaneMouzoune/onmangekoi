'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { updatePseudo } from '@/data-access/profile'
import { createServerClient } from '@/data-access/supabase'
import { UpdatePseudoSchema } from '@/lib/schemas/profile'

export type PseudoActionState = { error: string } | null

export async function updatePseudoAction(
  _prevState: PseudoActionState,
  formData: FormData
): Promise<{ error: string }> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié' }

  const parsed = UpdatePseudoSchema.safeParse({ pseudo: formData.get('pseudo') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    await updatePseudo(supabase, user.id, parsed.data.pseudo)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erreur lors de la mise à jour' }
  }

  revalidatePath('/', 'layout')
  redirect('/sessions/new')
}
