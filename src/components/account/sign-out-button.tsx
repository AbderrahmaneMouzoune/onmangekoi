'use client'

import { RiLogoutBoxRLine } from '@remixicon/react'
import { useTransition } from 'react'

import { signOutAction } from '@/actions/auth'
import { TwoStepButton } from '@/components/ui/two-step-button'

export function SignOutButton({ isAnonymous }: { isAnonymous: boolean }) {
  const [isPending, startTransition] = useTransition()

  return (
    <TwoStepButton
      variant="ghost"
      className="text-muted-foreground hover:text-veto"
      label={
        <>
          <RiLogoutBoxRLine aria-hidden="true" />
          Se déconnecter
        </>
      }
      confirmLabel={
        isAnonymous
          ? 'Confirmer — sans email lié, tes listes seront perdues'
          : 'Confirmer la déconnexion'
      }
      onConfirm={() => startTransition(() => signOutAction())}
      disabled={isPending}
    />
  )
}
