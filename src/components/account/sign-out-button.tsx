'use client'

import { RiLogoutBoxRLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'

import { signOutAction } from '@/actions/auth'
import { TwoStepButton } from '@/components/ui/two-step-button'

export function SignOutButton({ isAnonymous }: { isAnonymous: boolean }) {
  const t = useTranslations('account.signOut')
  const [isPending, startTransition] = useTransition()

  return (
    <TwoStepButton
      variant="ghost"
      className="text-muted-foreground hover:text-veto"
      label={
        <>
          <RiLogoutBoxRLine aria-hidden="true" />
          {t('label')}
        </>
      }
      confirmLabel={isAnonymous ? t('confirmAnonymous') : t('confirm')}
      onConfirm={() => startTransition(() => signOutAction())}
      disabled={isPending}
    />
  )
}
