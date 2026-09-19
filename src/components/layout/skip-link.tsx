/**
 * Lien d'évitement : premier élément focalisable de chaque page, invisible
 * jusqu'à ce qu'un Tab l'atteigne. Il saute l'en-tête pour poser le focus
 * sur `<main id="main">`.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand shadow-lg outline-none focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-[60] focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      Aller au contenu
    </a>
  )
}
