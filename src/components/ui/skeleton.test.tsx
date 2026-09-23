// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Skeleton, SkeletonRow } from './skeleton'

describe('Skeleton', () => {
  it('should stay hidden from assistive tech: it says nothing yet', () => {
    const { container } = render(<Skeleton className="h-5 w-40" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('should render as a span when it stands inside a paragraph', () => {
    const { container } = render(<Skeleton as="span" />)
    expect(container.firstElementChild?.tagName).toBe('SPAN')
  })

  it('should hide every piece of a row', () => {
    const { container } = render(<SkeletonRow badgeWidth="w-16" />)
    const visible = [...container.querySelectorAll('.animate-pulse')].filter(
      (node) => node.getAttribute('aria-hidden') !== 'true'
    )
    expect(visible).toEqual([])
  })
})
