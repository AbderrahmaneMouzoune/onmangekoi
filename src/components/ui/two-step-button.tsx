'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

interface TwoStepButtonProps extends Omit<
  React.ComponentProps<typeof Button>,
  'onClick' | 'children'
> {
  label: React.ReactNode
  confirmLabel: React.ReactNode
  onConfirm: () => void
  /** Délai avant de revenir à l'état initial */
  resetMs?: number
}

/**
 * Bouton à confirmation en deux temps, sans modale : un premier clic arme,
 * un second confirme. Adapté au mobile et aux actions irréversibles.
 */
export function TwoStepButton({
  label,
  confirmLabel,
  onConfirm,
  resetMs = 4000,
  ...props
}: TwoStepButtonProps) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), resetMs)
    return () => window.clearTimeout(timer)
  }, [armed, resetMs])

  return (
    <Button
      type="button"
      aria-live="polite"
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else {
          setArmed(true)
        }
      }}
      {...props}
    >
      {armed ? confirmLabel : label}
    </Button>
  )
}
