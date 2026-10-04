'use client'

import { useTranslations } from 'next-intl'
import { useActionState } from 'react'

import { updatePseudoAction } from '@/actions/profile'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { PSEUDO_MAX, PSEUDO_MIN } from '@/domain/schemas/profile'

export function UpdatePseudoForm({ currentPseudo }: { currentPseudo: string }) {
  const t = useTranslations('account.pseudo')
  const [state, formAction, isPending] = useActionState(updatePseudoAction, null)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label htmlFor="pseudo">{t('label')}</Label>
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
          {isPending ? <Spinner /> : t('save')}
        </Button>
      </div>
      <FormMessage error={state?.error} success={state?.success} />
    </form>
  )
}
