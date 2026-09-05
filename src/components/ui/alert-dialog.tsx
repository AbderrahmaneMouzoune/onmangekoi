'use client'

import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog'

import { cn } from '@/lib/utils'

/**
 * Boîte de dialogue de confirmation, pour les actions qu'on ne peut pas
 * annuler. Contrairement à un dialogue ordinaire, elle ne se ferme ni par
 * Échap ni par un clic à côté : il faut choisir explicitement.
 *
 * Pour les actions réversibles ou à faible enjeu, préférer `TwoStepButton` —
 * pas de modale, pas de changement de contexte.
 */
const AlertDialogRoot = AlertDialogPrimitive.Root
const AlertDialogTrigger = AlertDialogPrimitive.Trigger
const AlertDialogClose = AlertDialogPrimitive.Close

function AlertDialogPopup({ className, children, ...props }: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        data-slot="alert-dialog-backdrop"
        className="fixed inset-0 z-50 bg-slate/60 backdrop-blur-xs transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-popup"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl bg-background p-5 shadow-lg ring-1 ring-line outline-none',
          'transition-[opacity,transform] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
          className
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPrimitive.Portal>
  )
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('font-display text-lg font-bold text-ink', className)}
      {...props}
    />
  )
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
}
