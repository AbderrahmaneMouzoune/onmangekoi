'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { setPasswordAction } from '@/lib/actions/auth'

export function SetPasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction, isPending] = useActionState(setPasswordAction, null)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{hasPassword ? 'Nouveau mot de passe' : 'Mot de passe'}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirmer</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <FormMessage error={state?.error} success={state?.success} />
      <Button type="submit" variant="secondary" disabled={isPending} className="self-start">
        {isPending ? (
          <Spinner />
        ) : hasPassword ? (
          'Changer le mot de passe'
        ) : (
          'Définir le mot de passe'
        )}
      </Button>
    </form>
  )
}
