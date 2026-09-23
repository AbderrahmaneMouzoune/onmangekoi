import { Input as InputPrimitive } from '@base-ui/react/input'
import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * L'anneau de focus est opaque : le seul changement de bordure ne pèse que
 * 2,9:1 entre l'état posé et l'état focalisé, sous le seuil de la 1.4.11.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3.5 text-base text-ink shadow-sm transition-[border-color,box-shadow] outline-none placeholder:text-ink-muted focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-veto aria-invalid:ring-3 aria-invalid:ring-veto/20',
        className
      )}
      {...props}
    />
  )
}

export { Input }
