'use client'

import { RiDeleteBin6Line } from '@remixicon/react'
import { useTranslations } from 'next-intl'
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

/**
 * Le mot à recopier pour armer la suppression est dans la langue de la page
 * (`account.delete.word` : « effacer », « delete ») : on recopie ce qu'on lit.
 * La casse, les espaces et la majuscule automatique du clavier mobile sont
 * tolérés.
 */
export function matchesConfirmation(input: string, word: string): boolean {
  return input.trim().toLocaleLowerCase() === word.toLocaleLowerCase()
}

/**
 * Suppression définitive du compte (art. 17 RGPD). Un `TwoStepButton` suffirait
 * à éviter le clic accidentel, mais pas la décision prise trop vite : recopier
 * un mot oblige à lire ce qui va disparaître.
 */
export function DeleteAccountButton() {
  const t = useTranslations('account.delete')
  const tCommon = useTranslations('common')
  const word = t('word')
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const canDelete = matchesConfirmation(confirmation, word)

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
            {t('button')}
          </Button>
        }
      />

      <AlertDialogPopup>
        <AlertDialogTitle>{t('title')}</AlertDialogTitle>
        <AlertDialogDescription>{t('description')}</AlertDialogDescription>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>
              {t.rich('prompt', {
                word,
                mono: (chunks) => <span className="font-mono font-semibold">{chunks}</span>,
              })}
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
              placeholder={word}
            />
          </div>

          <FormMessage error={error} />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogClose
              disabled={isPending}
              render={
                <button type="button" className={cn(buttonVariants({ variant: 'outline' }))}>
                  {tCommon('actions.cancel')}
                </button>
              }
            />
            <Button type="submit" variant="destructive" disabled={!canDelete || isPending}>
              {isPending ? <Spinner /> : t('submit')}
            </Button>
          </div>
        </form>
      </AlertDialogPopup>
    </AlertDialogRoot>
  )
}
