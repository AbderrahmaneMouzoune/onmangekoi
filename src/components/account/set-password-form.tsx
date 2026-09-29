'use client'

import { useTranslations } from 'next-intl'
import { useActionState } from 'react'

import { setPasswordAction } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'

export function SetPasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations('account.password')
  const [state, formAction, isPending] = useActionState(setPasswordAction, null)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{hasPassword ? t('newLabel') : t('label')}</Label>
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
        <Label htmlFor="confirm">{t('confirm')}</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <FormMessage error={state?.error} success={state?.success} />
      <Button type="submit" variant="secondary" disabled={isPending} className="self-start">
        {isPending ? <Spinner /> : hasPassword ? t('change') : t('set')}
      </Button>
    </form>
  )
}
