'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { joinSessionAction } from '@/lib/actions/sessions'

interface Props {
  initialError?: string
}

export function JoinForm({ initialError }: Props) {
  const [state, formAction, isPending] = useActionState(joinSessionAction, null)

  return (
    <div className="space-y-6">
      {initialError && (
        <p className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {initialError}
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="identifier">Code ou lien d&apos;invitation</Label>
          <Input
            id="identifier"
            name="identifier"
            placeholder="Ex: A3F9B2"
            required
            autoFocus
            autoCapitalize="characters"
            className="font-mono text-lg tracking-widest uppercase"
          />
          <p className="text-xs text-muted-foreground">
            Saisis le code à 6 caractères ou colle le lien complet.
          </p>
        </div>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? 'Vérification...' : 'Rejoindre'}
        </Button>
      </form>
    </div>
  )
}
