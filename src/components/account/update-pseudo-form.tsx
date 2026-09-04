'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { updatePseudoAction } from '@/lib/actions/profile'
import { PSEUDO_MAX, PSEUDO_MIN } from '@/lib/schemas/profile'

export function UpdatePseudoForm({ currentPseudo }: { currentPseudo: string }) {
  const [state, formAction, isPending] = useActionState(updatePseudoAction, null)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label htmlFor="pseudo">Pseudo</Label>
      <div className="flex gap-2">
        <Input
          id="pseudo"
          name="pseudo"
          defaultValue={currentPseudo}
          required
          minLength={PSEUDO_MIN}
          maxLength={PSEUDO_MAX}
          autoComplete="nickname"
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? <Spinner /> : 'Enregistrer'}
        </Button>
      </div>
      <FormMessage error={state?.error} success={state?.success} />
    </form>
  )
}
