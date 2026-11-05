'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { revokeApiTokenAction } from '@/actions/ai-tokens'
import { FormMessage } from '@/components/ui/form-message'
import { TwoStepButton } from '@/components/ui/two-step-button'

/**
 * Révoquer en deux clics : l'IA qui s'en servait perd l'accès aussitôt. Une
 * fois révoqué, l'action revalide `/account` et la ligne disparaît.
 */
export function RevokeAiTokenButton({ tokenId, label }: { tokenId: string; label: string }) {
  const t = useTranslations('account.ai.tokens')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col items-end gap-2">
      <TwoStepButton
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-veto"
        disabled={isPending}
        label={
          <>
            {/* Visible : « Révoquer » ; lu : « Révoquer le jeton Claude ». Un
                aria-label masquerait aussi le libellé de confirmation. */}
            <span aria-hidden="true">{t('revoke')}</span>
            <span className="sr-only">{t('revokeLabel', { label })}</span>
          </>
        }
        confirmLabel={t('confirmRevoke')}
        onConfirm={() =>
          startTransition(async () => {
            setError(null)
            const result = await revokeApiTokenAction(tokenId)
            if (!result.ok) setError(result.error)
          })
        }
      />
      <FormMessage error={error} />
    </div>
  )
}
