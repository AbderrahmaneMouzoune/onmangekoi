'use client'

import { useTranslations } from 'next-intl'
import { useTransition } from 'react'

import { revokeApiTokenAction } from '@/actions/ai-tokens'
import { TwoStepButton } from '@/components/ui/two-step-button'

/** Révoquer en deux clics : l'IA qui s'en servait perd l'accès aussitôt. */
export function RevokeAiTokenButton({ tokenId }: { tokenId: string }) {
  const t = useTranslations('account.ai.tokens')
  const [isPending, startTransition] = useTransition()

  return (
    <TwoStepButton
      size="sm"
      variant="ghost"
      disabled={isPending}
      label={t('revoke')}
      confirmLabel={t('confirmRevoke')}
      onConfirm={() =>
        startTransition(async () => {
          await revokeApiTokenAction(tokenId)
        })
      }
    />
  )
}
