// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Spinner } from './spinner'

describe('Spinner', () => {
  it('should stay hidden: the button it sits in carries the wording', () => {
    const { container } = render(<Spinner />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})
