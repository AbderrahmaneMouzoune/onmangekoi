import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  max: number
  label?: string
  className?: string
  tone?: 'brand' | 'yes' | 'chalk'
}

const TONES = {
  brand: 'bg-brand',
  yes: 'bg-yes',
  chalk: 'bg-chalk',
} as const

export function Progress({ value, max, label, className, tone = 'brand' }: ProgressProps) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-line', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', TONES[tone])}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  )
}
