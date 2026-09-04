import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent font-sans text-sm font-semibold whitespace-nowrap transition-[background-color,color,border-color,box-shadow,transform] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-disabled:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5",
  {
    variants: {
      variant: {
        default: 'bg-brand text-on-brand shadow-sm hover:bg-brand-hover',
        secondary: 'bg-surface-2 text-ink hover:bg-line',
        outline: 'border-line-strong bg-surface text-ink hover:bg-surface-2',
        ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        destructive: 'bg-veto-soft text-veto hover:bg-veto hover:text-white',
        chalk: 'bg-chalk text-slate hover:bg-white',
        link: 'h-auto rounded-none px-0 text-brand underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-4',
        sm: 'h-9 px-3 text-[0.8125rem]',
        lg: 'h-12 px-5 text-base',
        icon: 'size-11',
        'icon-sm': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
