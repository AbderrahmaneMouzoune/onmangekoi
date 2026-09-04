'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { linkEmailAction } from '@/lib/actions/auth'

export function LinkEmailForm({ pendingEmail }: { pendingEmail?: string | null }) {
  const [state, formAction, isPending] = useActionState(linkEmailAction, null)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label htmlFor="email">Adresse email</Label>
      <div className="flex gap-2">
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={pendingEmail ?? ''}
          placeholder="toi@exemple.fr"
          required
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? <Spinner /> : pendingEmail ? 'Renvoyer' : 'Lier'}
        </Button>
      </div>
      {pendingEmail && !state && (
        <p className="text-xs text-muted-foreground">
          Un email de confirmation a été envoyé à <strong>{pendingEmail}</strong>. Ouvre le lien
          pour valider.
        </p>
      )}
      <FormMessage error={state?.error} success={state?.success} />
    </form>
  )
}
