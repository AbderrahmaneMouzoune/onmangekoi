'use client'

import { RiQrScanLine } from '@remixicon/react'
import { useRouter } from 'next/navigation'
import { useActionState, useCallback, useState } from 'react'

import { joinSessionAction } from '@/actions/sessions'
import { QrScanner } from '@/components/session/qr-scanner'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { router } from '@/config/router.config'
import { parseInviteIdentifier } from '@/domain/share'
import { rememberSessionEntry } from '@/lib/analytics/handoff'

export function JoinForm({ initialError }: { initialError?: string }) {
  const navigation = useRouter()
  const [state, formAction, isPending] = useActionState(joinSessionAction, null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const handleDetected = useCallback(
    (value: string) => {
      const identifier = parseInviteIdentifier(value)
      if (identifier.kind === 'invalid') {
        setScanError('Ce QR code n’est pas une invitation onmangekoi.')
        return
      }
      setScanning(false)
      rememberSessionEntry({ kind: 'joined', via: 'scan' })
      navigation.push(router.joinInvite(identifier.value))
    },
    [navigation]
  )

  return (
    <div className="flex flex-col gap-4">
      {scanning ? (
        <QrScanner onDetected={handleDetected} onClose={() => setScanning(false)} />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            setScanError(null)
            setScanning(true)
          }}
        >
          <RiQrScanLine aria-hidden="true" />
          Scanner le QR code du host
        </Button>
      )}

      <FormMessage error={scanError} />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-line" />
        ou saisis le code
        <span className="h-px flex-1 bg-line" />
      </div>

      <form
        action={formAction}
        onSubmit={() => rememberSessionEntry({ kind: 'joined', via: 'code' })}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="identifier">Code ou lien d’invitation</Label>
          <Input
            id="identifier"
            name="identifier"
            placeholder="A3F 9B2"
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={state?.error ? true : undefined}
            className="h-14 font-mono text-2xl tracking-[0.25em] uppercase placeholder:tracking-[0.25em]"
          />
          <p className="text-xs text-muted-foreground">
            Le code à 6 caractères, ou le lien complet collé tel quel. Majuscules et tirets sont
            optionnels.
          </p>
        </div>

        <FormMessage error={state?.error ?? initialError} />

        <Button type="submit" size="lg" disabled={isPending} className="w-full">
          {isPending ? <Spinner /> : 'Rejoindre'}
        </Button>
      </form>
    </div>
  )
}
