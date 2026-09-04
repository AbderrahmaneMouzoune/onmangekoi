import { RiCheckLine, RiErrorWarningLine } from '@remixicon/react'

import { cn } from '@/lib/utils'

interface FormMessageProps {
  error?: string | null
  success?: string | null
  className?: string
}

/** Bandeau d'erreur ou de succès sous un formulaire. Annoncé aux lecteurs d'écran. */
export function FormMessage({ error, success, className }: FormMessageProps) {
  if (!error && !success) return null
  const isError = Boolean(error)
  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md px-3 py-2.5 text-sm',
        isError ? 'bg-veto-soft text-veto' : 'bg-yes-soft text-yes',
        className
      )}
    >
      {isError ? (
        <RiErrorWarningLine aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      ) : (
        <RiCheckLine aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{error ?? success}</span>
    </p>
  )
}
