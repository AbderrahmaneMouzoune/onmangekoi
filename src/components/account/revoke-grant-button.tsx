'use client'

import { RiLinkUnlinkM } from '@remixicon/react'
import { useState, useTransition } from 'react'

import { revokeOAuthGrantAction } from '@/app/[locale]/oauth/actions'
import { FormMessage } from '@/components/ui/form-message'
import { TwoStepButton } from '@/components/ui/two-step-button'

interface Labels {
  disconnect: string
  confirm: string
  /** Nom accessible du bouton : « Déconnecter Claude », pas trois « Déconnecter » identiques. */
  accessible: string
}

/**
 * Déconnexion d'une app, en deux temps comme la déconnexion du compte : un
 * clic arme, le second révoque. Les libellés arrivent traduits du serveur.
 * Une fois révoquée, l'action revalide `/account` et la ligne disparaît.
 */
export function RevokeGrantButton({ clientId, labels }: { clientId: string; labels: Labels }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col items-end gap-2">
      <TwoStepButton
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-veto"
        label={
          <>
            <RiLinkUnlinkM aria-hidden="true" />
            {/* Visible : « Déconnecter » ; lu : « Déconnecter Claude ». Un
                aria-label masquerait aussi le libellé de confirmation. */}
            <span aria-hidden="true">{labels.disconnect}</span>
            <span className="sr-only">{labels.accessible}</span>
          </>
        }
        confirmLabel={labels.confirm}
        disabled={isPending}
        onConfirm={() =>
          startTransition(async () => {
            setError(null)
            const result = await revokeOAuthGrantAction(clientId)
            if (!result.ok) setError(result.error)
          })
        }
      />
      <FormMessage error={error} />
    </div>
  )
}
