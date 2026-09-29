import type { ReactNode } from 'react'

/** Filet « ou … » entre les boutons Google / Apple et le parcours email. */
export function OrSeparator({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
      {children}
    </p>
  )
}
