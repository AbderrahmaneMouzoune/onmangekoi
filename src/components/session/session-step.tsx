import { cn } from '@/lib/utils'

/**
 * Intitulés des étapes — partagés avec la silhouette, qui les écrit en clair.
 * Les trois premières sont pour tout le monde ; la quatrième n'existe que si
 * on a déjà sauvegardé un groupe, et la silhouette ne la réserve donc pas.
 */
export const SESSION_STEPS = {
  name: 'Nom de la session',
  restaurants: 'Les restos à départager',
  restaurantsHint:
    'Tes listes, le carnet des restos déjà connus, Google : pioche où tu veux et mélange.',
  deadline: 'Clôture automatique',
  groups: 'Inviter un groupe',
  groupsHint: 'L’équipe du déjeuner, prévenue d’un clic — sans que personne ne retape le code.',
} as const

interface StepTitleProps {
  number: number
  children: React.ReactNode
  className?: string
}

/**
 * Titre d'étape du formulaire de session : une pastille rouge numérotée et
 * l'intitulé. C'est la signature de cet écran — la création de liste, elle,
 * n'a pas d'étapes : on y prépare une réserve, on ne lance rien.
 */
export function StepTitle({ number, children, className }: StepTitleProps) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand font-mono text-xs font-semibold text-on-brand tabular"
      >
        {number}
      </span>
      {children}
    </span>
  )
}

interface SessionStepProps {
  number: number
  /** Intitulé : un `<Label>` quand l'étape est un champ, un `<h2>` sinon. */
  title: React.ReactNode
  hint?: string
  children: React.ReactNode
}

export function SessionStep({ number, title, hint, children }: SessionStepProps) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <StepTitle number={number}>{title}</StepTitle>
        {hint && <p className="pl-8.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}
