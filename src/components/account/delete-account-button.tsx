'use client'

import { RiDeleteBin6Line } from '@remixicon/react'
import { useId, useState, useTransition } from 'react'

import { deleteAccountAction } from '@/actions/account'
import {
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/** Mot à recopier pour armer la suppression. */
export const DELETE_CONFIRMATION = 'effacer'

/** Tolère la casse, les espaces et la majuscule automatique du clavier mobile. */
function matchesConfirmation(input: string): boolean {
  return input.trim().toLowerCase() === DELETE_CONFIRMATION
}

/**
 * Suppression définitive du compte (art. 17 RGPD). Un `TwoStepButton` suffirait
 * à éviter le clic accidentel, mais pas la décision prise trop vite : recopier
 * un mot oblige à lire ce qui va disparaître.
 */
export function DeleteAccountButton() {
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const canDelete = matchesConfirmation(confirmation)

  function reset() {
    setConfirmation('')
    setError(null)
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canDelete || isPending) return
    startTransition(async () => {
      setError(null)
      const result = await deleteAccountAction()
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <AlertDialogRoot
      open={open}
      onOpenChange={(next) => {
        // Pendant l'appel, la modale reste ouverte : la fermer laisserait
        // croire que rien ne se passe alors que la suppression est en cours.
        if (isPending) return
        setOpen(next)
        if (!next) reset()
      }}
    >
      <AlertDialogTrigger
        render={
          <Button variant="destructive" className="w-full">
            <RiDeleteBin6Line aria-hidden="true" />
            Supprimer mon compte
          </Button>
        }
      />

      <AlertDialogPopup>
        <AlertDialogTitle>Supprimer mon compte ?</AlertDialogTitle>
        <AlertDialogDescription>
          Ton profil, ton pseudo, ton email et tes listes seront effacés définitivement. Les votes
          déjà comptés dans une session terminée restent dans le classement, mais plus rien ne les
          reliera à toi.
        </AlertDialogDescription>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>
              Écris <span className="font-mono font-semibold">{DELETE_CONFIRMATION}</span> pour
              confirmer
            </Label>
            <Input
              id={inputId}
              name="confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={isPending}
              placeholder={DELETE_CONFIRMATION}
            />
          </div>

          <FormMessage error={error} />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogClose
              disabled={isPending}
              render={
                <button type="button" className={cn(buttonVariants({ variant: 'outline' }))}>
                  Annuler
                </button>
              }
            />
            <Button type="submit" variant="destructive" disabled={!canDelete || isPending}>
              {isPending ? <Spinner /> : 'Supprimer définitivement'}
            </Button>
          </div>
        </form>
      </AlertDialogPopup>
    </AlertDialogRoot>
  )
}
