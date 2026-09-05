'use client'

import { RiDeleteBin6Line } from '@remixicon/react'
import { useState, useTransition } from 'react'

import { FormMessage } from '@/components/ui/form-message'
import { TwoStepButton } from '@/components/ui/two-step-button'
import { deleteAccountAction } from '@/lib/actions/account'

/**
 * Suppression définitive du compte, en deux clics (art. 17 RGPD).
 * Le libellé de confirmation dit ce qui disparaît vraiment : les votes déjà
 * comptés restent dans les classements, mais plus rien ne les relie à toi.
 */
export function DeleteAccountButton() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-2">
      <TwoStepButton
        variant="destructive"
        className="w-full"
        label={
          <>
            <RiDeleteBin6Line aria-hidden="true" />
            Supprimer mon compte
          </>
        }
        confirmLabel="Confirmer — c’est définitif"
        onConfirm={() =>
          startTransition(async () => {
            setError(null)
            const result = await deleteAccountAction()
            if (!result.ok) setError(result.error)
          })
        }
        disabled={isPending}
      />
      <FormMessage error={error} />
    </div>
  )
}
