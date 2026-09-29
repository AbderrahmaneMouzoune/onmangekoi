'use client'

import { RiAppleFill, RiGoogleFill } from '@remixicon/react'
import { useActionState } from 'react'

import { startOAuthAction } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { OAUTH_PROVIDER_LABELS } from '@/domain/oauth'

import type { OAuthIntent, OAuthProvider } from '@/domain/oauth'
import type { ComponentType } from 'react'

const PROVIDER_ICONS: Record<OAuthProvider, ComponentType<{ className?: string }>> = {
  google: RiGoogleFill,
  apple: RiAppleFill,
}

interface OAuthButtonsProps {
  /** Fournisseurs à proposer — déjà filtrés sur ceux que le déploiement active. */
  providers: readonly OAuthProvider[]
  /** `link` depuis « Mon compte », `login` depuis `/login`. */
  intent: OAuthIntent
  /** Destination après le retour du fournisseur (validée côté serveur). */
  next?: string
}

/** « Continuer avec Google / Apple ». Ne rend rien si aucun fournisseur n'est actif. */
export function OAuthButtons({ providers, intent, next }: OAuthButtonsProps) {
  if (providers.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {providers.map((provider) => (
        <OAuthButton key={provider} provider={provider} intent={intent} next={next} />
      ))}
    </div>
  )
}

/**
 * Un formulaire par fournisseur : chacun garde son état d'attente et son
 * message, et le bouton fonctionne avant l'hydratation (action serveur).
 */
function OAuthButton({
  provider,
  intent,
  next,
}: {
  provider: OAuthProvider
  intent: OAuthIntent
  next?: string
}) {
  const [state, formAction, isPending] = useActionState(startOAuthAction, null)
  const Icon = PROVIDER_ICONS[provider]

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="intent" value={intent} />
      {next && <input type="hidden" name="next" value={next} />}
      <Button type="submit" variant="outline" size="lg" disabled={isPending} className="w-full">
        {isPending ? <Spinner /> : <Icon aria-hidden="true" />}
        Continuer avec {OAUTH_PROVIDER_LABELS[provider]}
      </Button>
      <FormMessage error={state?.error} />
    </form>
  )
}
