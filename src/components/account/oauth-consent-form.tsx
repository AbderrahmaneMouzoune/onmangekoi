'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { decideAuthorizationAction } from '@/app/[locale]/oauth/actions'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'

interface Labels {
  approve: string
  deny: string
}

/**
 * Les deux réponses possibles à une demande d'autorisation. Les libellés
 * arrivent traduits du serveur : l'espace `oauth` ne part pas dans le
 * catalogue client pour deux boutons.
 *
 * Un seul formulaire, deux boutons `name="decision"` : la valeur du bouton
 * cliqué voyage dans le FormData, et sans JavaScript le formulaire marche
 * pareil (la Server Action redirige vers l'app).
 */
export function OAuthConsentForm({
  authorizationId,
  labels,
}: {
  authorizationId: string
  labels: Labels
}) {
  const [state, formAction] = useActionState(decideAuthorizationAction, null)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="authorization_id" value={authorizationId} />
      <FormMessage error={state?.error} />
      <DecisionButtons labels={labels} />
    </form>
  )
}

function DecisionButtons({ labels }: { labels: Labels }) {
  const { pending, data } = useFormStatus()
  const choice = pending ? data?.get('decision') : null

  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="submit" name="decision" value="deny" variant="outline" disabled={pending}>
        {choice === 'deny' ? <Spinner /> : null}
        {labels.deny}
      </Button>
      <Button type="submit" name="decision" value="approve" disabled={pending}>
        {choice === 'approve' ? <Spinner /> : null}
        {labels.approve}
      </Button>
    </div>
  )
}
