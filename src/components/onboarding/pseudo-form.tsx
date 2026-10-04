'use client'

import { RiArrowRightLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { useActionState } from 'react'

import { setupProfileAction } from '@/actions/profile'
import { TurnstileWidget } from '@/components/onboarding/turnstile-widget'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { PSEUDO_MAX, PSEUDO_MIN } from '@/domain/schemas/profile'

interface PseudoFormProps {
  next?: string
  /** Le bouton dit « Rejoindre » quand le pseudo ouvre la porte d'une invitation. */
  joining?: boolean
}

export function PseudoForm({ next, joining = false }: PseudoFormProps) {
  const [state, formAction, isPending] = useActionState(setupProfileAction, null)
  const t = useTranslations('onboarding.pseudo')

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="pseudo">{t('label')}</Label>
        <Input
          id="pseudo"
          name="pseudo"
          placeholder={t('placeholder')}
          required
          minLength={PSEUDO_MIN}
          maxLength={PSEUDO_MAX}
          autoComplete="nickname"
          autoCapitalize="words"
          autoFocus
          aria-invalid={state?.error ? true : undefined}
          className="h-12 text-lg"
        />
        <p className="text-xs text-muted-foreground">{t('help')}</p>
      </div>

      <TurnstileWidget action="setup-profile" resetKey={state} />

      <FormMessage error={state?.error} />

      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? <Spinner /> : joining ? t('submitJoin') : t('submit')}
        {!isPending && <RiArrowRightLine aria-hidden="true" />}
      </Button>
    </form>
  )
}
