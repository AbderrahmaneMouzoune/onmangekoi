'use client'

import { useTranslations } from 'next-intl'
import { useActionState } from 'react'

import { linkEmailAction } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'

export function LinkEmailForm({ pendingEmail }: { pendingEmail?: string | null }) {
  const t = useTranslations('account.email')
  const [state, formAction, isPending] = useActionState(linkEmailAction, null)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label htmlFor="email">{t('label')}</Label>
      <div className="flex gap-2">
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={pendingEmail ?? ''}
          placeholder={t('placeholder')}
          required
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? <Spinner /> : pendingEmail ? t('resend') : t('link')}
        </Button>
      </div>
      {pendingEmail && !state && (
        <p className="text-xs text-muted-foreground">
          {t.rich('pending', {
            email: pendingEmail,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      )}
      <FormMessage error={state?.error} success={state?.success} />
    </form>
  )
}
