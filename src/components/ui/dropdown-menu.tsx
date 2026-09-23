'use client'

import { Menu as MenuPrimitive } from '@base-ui/react/menu'

import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

/**
 * Menu déroulant ancré à son déclencheur, pour les raccourcis d'un même
 * endroit — destinations et actions mélangées. Ce n'est pas un `Select` : rien
 * n'y est « choisi », chaque ligne part faire quelque chose.
 *
 * Le popup est porté en fin de `<body>` et posé à `z-40` : au-dessus de
 * l'en-tête collant (`z-30`), jamais par-dessus une modale (`z-50`).
 */
const DropdownMenuRoot = MenuPrimitive.Root
const DropdownMenuTrigger = MenuPrimitive.Trigger

interface DropdownMenuPopupProps extends MenuPrimitive.Popup.Props {
  /** Alignement sur le déclencheur — un menu d'en-tête s'aligne à droite. */
  align?: MenuPrimitive.Positioner.Props['align']
  side?: MenuPrimitive.Positioner.Props['side']
  sideOffset?: MenuPrimitive.Positioner.Props['sideOffset']
}

function DropdownMenuPopup({
  align = 'end',
  side = 'bottom',
  sideOffset = 8,
  className,
  children,
  ...props
}: DropdownMenuPopupProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner align={align} side={side} sideOffset={sideOffset} className="z-40">
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-popup"
          className={cn(
            // `--available-height` vient du positionneur : sur un petit écran
            // le menu se borne à la place restante et défile lui-même plutôt
            // que de déborder sous le bord.
            'flex max-h-[var(--available-height)] min-w-52 origin-[var(--transform-origin)] flex-col gap-0.5 overflow-y-auto rounded-xl bg-background p-1.5 shadow-lg ring-1 ring-line outline-none',
            'transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
            className
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

/**
 * Le survol et le parcours au clavier partagent le même état `highlighted` :
 * une seule ligne est mise en avant à la fois, quel que soit le moyen d'y
 * arriver.
 */
const itemClassName =
  "flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-2 no-underline outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-surface-2 data-highlighted:text-ink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5"

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(itemClassName, className)}
      {...props}
    />
  )
}

/**
 * Ligne qui mène ailleurs : un vrai `<a>`, donc ouvrable dans un nouvel onglet
 * et annoncé comme un lien. Le composer avec `next/link` via `render` garde la
 * navigation côté client et le préchargement.
 */
function DropdownMenuLinkItem({ className, ...props }: MenuPrimitive.LinkItem.Props) {
  return (
    <MenuPrimitive.LinkItem
      data-slot="dropdown-menu-link-item"
      closeOnClick
      className={cn(itemClassName, className)}
      {...props}
    />
  )
}

/** Le trait mord sur la gouttière du popup pour aller d'un bord à l'autre. */
function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return <Separator className={cn('-mx-1.5 my-1', className)} {...props} />
}

export {
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuPopup,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}
