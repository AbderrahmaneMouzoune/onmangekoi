'use client'

import { RiArrowRightLine } from '@remixicon/react'
import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { setupProfileAction } from '@/lib/actions/profile'
import { PSEUDO_MAX, PSEUDO_MIN } from '@/lib/schemas/profile'

interface PseudoFormProps {
  next?: string
  submitLabel?: string
}

export function PseudoForm({ next, submitLabel = 'C’est parti' }: PseudoFormProps) {
  const [state, formAction, isPending] = useActionState(setupProfileAction, null)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="pseudo">Ton pseudo</Label>
        <Input
          id="pseudo"
          name="pseudo"
          placeholder="Ex. Alex"
          required
          minLength={PSEUDO_MIN}
          maxLength={PSEUDO_MAX}
          autoComplete="nickname"
          autoCapitalize="words"
          autoFocus
          aria-invalid={state?.error ? true : undefined}
          className="h-12 text-lg"
        />
        <p className="text-xs text-muted-foreground">
          C’est le nom que les autres verront. Modifiable à tout moment.
        </p>
      </div>

      <FormMessage error={state?.error} />

      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? <Spinner /> : submitLabel}
        {!isPending && <RiArrowRightLine aria-hidden="true" />}
      </Button>
    </form>
  )
}
