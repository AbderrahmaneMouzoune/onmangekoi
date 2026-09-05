import { Input as InputPrimitive } from '@base-ui/react/input'
import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3.5 text-base text-ink shadow-sm transition-[border-color,box-shadow] outline-none placeholder:text-faint focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-veto aria-invalid:ring-3 aria-invalid:ring-veto/20',
        className
      )}
      {...props}
    />
  )
}

export { Input }
