'use client'

import {
  RiArrowDownSLine,
  RiBookmarkLine,
  RiLogoutBoxRLine,
  RiUserSettingsLine,
} from '@remixicon/react'
import Link from 'next/link'
import { useState, useTransition } from 'react'

import { signOutAction } from '@/actions/auth'
import {
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogRoot,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuPopup,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { router } from '@/config/router.config'
import { cn } from '@/lib/utils'

interface AccountMenuProps {
  /** Pseudo déjà présentable — `displayPseudo` a fait son travail. */
  pseudo: string
  /** Sans email lié, se déconnecter perd les listes : on le dit avant. */
  isAnonymous: boolean
}

/**
 * Pastille du compte dans l'en-tête. Cliquer sa photo de profil n'emmène plus
 * nulle part : ça ouvre les raccourcis du compte, et on choisit où aller. La
 * page « Mon compte » reste à un clic, mais elle n'est plus le seul geste
 * possible — c'était la surprise, sur un bouton qui ressemble à un menu.
 *
 * La déconnexion demande confirmation. Ailleurs un `TwoStepButton` suffit,
 * mais un menu se referme au premier clic : il n'y a pas de second temps à
 * offrir, donc c'est une modale qui le porte.
 */
export function AccountMenu({ pseudo, isAnonymous }: AccountMenuProps) {
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [isPending, startTransition] = useTransition()

  return (
    <>
      <DropdownMenuRoot>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="group/account gap-2 rounded-full pr-2 pl-1"
            >
              <Avatar name={pseudo} size="sm" />
              <span className="max-w-28 truncate">{pseudo}</span>
              <RiArrowDownSLine
                aria-hidden="true"
                className="size-4 transition-transform group-data-[popup-open]/account:rotate-180"
              />
            </Button>
          }
        />

        {/* Le menu tire son nom de son déclencheur : « menu, <pseudo> ». */}
        <DropdownMenuPopup>
          <DropdownMenuLinkItem render={<Link href={router.account()} />}>
            <RiUserSettingsLine aria-hidden="true" />
            Mon compte
          </DropdownMenuLinkItem>
          <DropdownMenuLinkItem render={<Link href={router.lists()} />}>
            <RiBookmarkLine aria-hidden="true" />
            Mes listes
          </DropdownMenuLinkItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="data-highlighted:bg-veto-soft data-highlighted:text-veto"
            onClick={() => setConfirmingSignOut(true)}
          >
            <RiLogoutBoxRLine aria-hidden="true" />
            Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuPopup>
      </DropdownMenuRoot>

      <AlertDialogRoot
        open={confirmingSignOut}
        onOpenChange={(next) => {
          // Pendant la déconnexion, la modale reste ouverte : la fermer
          // laisserait croire que rien ne se passe.
          if (isPending) return
          setConfirmingSignOut(next)
        }}
      >
        <AlertDialogPopup>
          <AlertDialogTitle>Se déconnecter ?</AlertDialogTitle>
          <AlertDialogDescription>
            {isAnonymous
              ? 'Ton pseudo n’est lié à aucun email : une fois déconnecté, tes listes et tes sessions seront perdues.'
              : 'Tu pourras revenir avec ton email et ton mot de passe.'}
          </AlertDialogDescription>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogClose
              disabled={isPending}
              render={
                <button type="button" className={cn(buttonVariants({ variant: 'outline' }))}>
                  Annuler
                </button>
              }
            />
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() => startTransition(() => signOutAction())}
            >
              {isPending ? <Spinner /> : 'Se déconnecter'}
            </Button>
          </div>
        </AlertDialogPopup>
      </AlertDialogRoot>
    </>
  )
}
