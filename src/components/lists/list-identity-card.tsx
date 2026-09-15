import { RiBookmarkFill } from '@remixicon/react'

/** Intitulés du formulaire — partagés avec la silhouette, qui les écrit en clair. */
export const LIST_FORM = {
  name: 'Nom de la liste',
  restaurants: 'Les restos de la liste',
  restaurantsHint: 'Tu pourras en ajouter ou en retirer plus tard.',
  submitEmpty: 'Enregistrer la liste vide',
} as const

/**
 * Carte d'identité d'une liste de favoris : le signet doré, le rappel de ce
 * qu'est une liste — et de ce qu'elle n'est pas. C'est la signature de cet
 * écran, là où la session a ses étapes numérotées en rouge : on ne peut pas
 * confondre « je remplis une réserve » et « je lance un vote ».
 */
export function ListIdentityCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg bg-fav-soft p-4 ring-1 ring-fav/30">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-fav shadow-sm"
        >
          <RiBookmarkFill className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[0.7rem] font-medium tracking-[0.12em] text-fav uppercase">
            Liste de favoris
          </p>
          <p className="text-sm text-ink-2">
            Une réserve de restos à ressortir dans tes sessions. Ici, on ne lance pas de vote.
          </p>
        </div>
      </div>
      {children}
    </section>
  )
}
