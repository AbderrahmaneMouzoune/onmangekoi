'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePseudoAction } from '@/lib/actions/profile'

export function PseudoForm() {
  const [state, formAction, isPending] = useActionState(updatePseudoAction, null)

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pseudo">Ton pseudo</Label>
        <Input
          id="pseudo"
          name="pseudo"
          placeholder="Ex: Alex"
          required
          minLength={2}
          maxLength={30}
          autoFocus
          className="text-lg"
        />
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Enregistrement...' : 'Continuer →'}
      </Button>
    </form>
  )
}
