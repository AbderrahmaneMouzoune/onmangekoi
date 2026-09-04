'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { joinSessionAction } from '@/lib/actions/sessions'

export function JoinForm({ initialError }: { initialError?: string }) {
  const [state, formAction, isPending] = useActionState(joinSessionAction, null)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="identifier">Code ou lien d’invitation</Label>
        <Input
          id="identifier"
          name="identifier"
          placeholder="A3F 9B2"
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={state?.error ? true : undefined}
          className="h-14 font-mono text-2xl tracking-[0.25em] uppercase placeholder:tracking-[0.25em]"
        />
        <p className="text-xs text-muted-foreground">
          Le code à 6 caractères, ou le lien complet collé tel quel.
        </p>
      </div>

      <FormMessage error={state?.error ?? initialError} />

      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? <Spinner /> : 'Rejoindre'}
      </Button>
    </form>
  )
}
