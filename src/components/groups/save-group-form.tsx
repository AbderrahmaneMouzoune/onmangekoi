'use client'

import { RiGroupLine } from '@remixicon/react'
import { useActionState, useEffect, useState } from 'react'

import { createGroupFromSessionAction } from '@/actions/groups'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { GROUP_NAME_MAX } from '@/domain/schemas/group'
import { captureEvent } from '@/lib/analytics/client'
import { countLabel } from '@/lib/format'

interface SaveGroupFormProps {
  sessionId: string
  /** Participants qui deviendront membres — le compte annoncé sous le champ. */
  memberCount: number
}

/**
 * Sauvegarde les participants de la session comme groupe récurrent.
 * Proposé à la fin du vote, quand on sait exactement qui était là : la
 * prochaine session les réinvite d'un clic, sans que personne ne retape le
 * code.
 */
export function SaveGroupForm({ sessionId, memberCount }: SaveGroupFormProps) {
  const [state, formAction, isPending] = useActionState(createGroupFromSessionAction, null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (state?.success) captureEvent('group_saved', { member_count: memberCount })
  }, [state?.success, memberCount])

  if (state?.success) {
    return <FormMessage success={state.success} />
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <RiGroupLine aria-hidden="true" />
        Sauvegarder ce groupe
      </Button>
    )
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Label htmlFor="group-name">Nom du groupe</Label>
      <div className="flex gap-2">
        <Input
          id="group-name"
          name="name"
          placeholder="L’équipe du déjeuner"
          autoFocus
          maxLength={GROUP_NAME_MAX}
          required
          autoComplete="off"
          className="flex-1"
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? <Spinner /> : 'Sauvegarder'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {countLabel(memberCount, 'participant')} de cette session. Tu pourras les réinviter d’un
        clic à la prochaine.
      </p>
      <FormMessage error={state?.error} />
    </form>
  )
}
