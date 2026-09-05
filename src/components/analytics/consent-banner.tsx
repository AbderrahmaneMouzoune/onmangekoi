'use client'

import { Button } from '@/components/ui/button'
import { useAnalyticsConsent } from '@/hooks/use-analytics-consent'
import { useIsClient } from '@/hooks/use-is-client'

/**
 * Bandeau de consentement, volontairement minimal (recommandations CNIL) :
 * finalité annoncée, refus aussi simple que l'acceptation — un clic, deux
 * boutons de même poids — et choix révisable à tout moment depuis « Mon
 * compte ». Rien n'est chargé avant la réponse, donc rien à « continuer sans
 * accepter » : fermer sans choisir revient à refuser.
 */
export function ConsentBanner() {
  const isClient = useIsClient()
  const { choice, available, accept, refuse } = useAnalyticsConsent()

  // Le choix vit dans le navigateur : attendre l'hydratation évite d'afficher
  // le bandeau une fraction de seconde à quelqu'un qui a déjà répondu.
  if (!isClient || !available || choice !== 'unset') return null

  return (
    <section
      aria-labelledby="consent-title"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 px-4 py-4 safe-bottom shadow-lg backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="consent-title" className="font-display text-base font-semibold">
            Mesurer pour améliorer
          </h2>
          <p className="text-sm text-muted-foreground">
            On aimerait savoir où les groupes décrochent — création, invitation, vote — pour
            corriger ce qui coince. Statistiques anonymes hébergées en Europe : ni pseudo, ni email,
            ni code d’invitation. Modifiable depuis « Mon compte ».
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={refuse}>
            Refuser
          </Button>
          <Button type="button" onClick={accept}>
            Accepter
          </Button>
        </div>
      </div>
    </section>
  )
}
