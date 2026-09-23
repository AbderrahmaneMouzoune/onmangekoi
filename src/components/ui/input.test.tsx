// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Input } from './input'
import { Label } from './label'

describe('Input + Label', () => {
  it('should take its accessible name from the associated label', () => {
    render(
      <>
        <Label htmlFor="pseudo">Ton pseudo</Label>
        <Input id="pseudo" />
      </>
    )
    expect(screen.getByRole('textbox', { name: 'Ton pseudo' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ton pseudo')).toHaveAttribute('data-slot', 'input')
  })

  it('should expose its invalid state and its description', () => {
    render(
      <>
        <Label htmlFor="code">Code ou lien</Label>
        <Input id="code" aria-invalid aria-describedby="code-error" />
        <p id="code-error">Code introuvable</p>
      </>
    )
    const input = screen.getByRole('textbox', { name: 'Code ou lien' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Code introuvable')
  })

  it('should keep a typed input out of the accessible name', () => {
    render(
      <>
        <Label htmlFor="mail">Email</Label>
        <Input id="mail" type="email" placeholder="toi@exemple.fr" />
      </>
    )
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
  })
})
