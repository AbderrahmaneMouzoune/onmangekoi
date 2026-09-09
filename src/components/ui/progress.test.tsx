// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Progress } from './progress'

describe('Progress', () => {
  it('should expose the progressbar role, its name and its bounds', () => {
    render(<Progress value={2} max={5} label="Progression du vote" />)
    const bar = screen.getByRole('progressbar', { name: 'Progression du vote' })
    expect(bar).toHaveAttribute('aria-valuenow', '2')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '5')
  })

  it('should stay at zero rather than divide by an empty deck', () => {
    render(<Progress value={3} max={0} label="Progression du vote" />)
    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '0%' })
  })
})
