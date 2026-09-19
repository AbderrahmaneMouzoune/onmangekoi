import { cn } from '@/lib/utils'

/**
 * Colonnes de contenu.
 *
 * - `narrow` : un seul geste à faire (pseudo, code, connexion) — la colonne
 *   reste étroite et centrée, même sur grand écran.
 * - `reading` : du texte à lire (confidentialité) — la largeur d'une ligne
 *   confortable, sans plus.
 * - `app` : les écrans de l'application — une colonne sur téléphone, la
 *   pleine largeur du desktop où chaque page dispose ses blocs en grille.
 */
const SIZES = {
  narrow: 'max-w-lg',
  reading: 'max-w-2xl lg:max-w-3xl',
  app: 'max-w-lg md:max-w-2xl lg:max-w-6xl',
} as const

export type ShellSize = keyof typeof SIZES

interface ShellProps extends React.ComponentProps<'main'> {
  size?: ShellSize
}

/**
 * Colonne de contenu, mobile-first, centrée sur grand écran. C'est aussi la
 * cible du lien d'évitement (`#main`) : focalisable, mais sans contour.
 */
export function Shell({ children, className, size = 'narrow', ...props }: ShellProps) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className={cn(
        'mx-auto flex w-full flex-1 flex-col gap-6 px-4 pt-6 pb-16 safe-bottom sm:px-6 lg:gap-8 lg:px-8 lg:pt-10',
        SIZES[size],
        className
      )}
      {...props}
    >
      {children}
    </main>
  )
}
