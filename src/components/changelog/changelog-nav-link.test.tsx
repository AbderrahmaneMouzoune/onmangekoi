// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { LATEST_RELEASE_VERSION } from '@/content/changelog'
import { CHANGELOG_SEEN_KEY } from '@/lib/changelog-seen'

import { ChangelogNavLink } from './changelog-nav-link'

/** La pastille est décorative : on la reconnaît au libellé du lien. */
const UNREAD_LABEL = 'Nouveautés — une version non lue'

describe('ChangelogNavLink', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('should stay silent on a first visit, and remember the current release', () => {
    render(<ChangelogNavLink />)

    expect(screen.getByRole('link', { name: 'Nouveautés' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: UNREAD_LABEL })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(CHANGELOG_SEEN_KEY)).toBe(LATEST_RELEASE_VERSION)
  })

  it('should light up when a release landed since the last visit', () => {
    window.localStorage.setItem(CHANGELOG_SEEN_KEY, '0.0.0')

    render(<ChangelogNavLink />)

    expect(screen.getByRole('link', { name: UNREAD_LABEL })).toBeInTheDocument()
  })

  it('should stay silent once the latest release has been read', () => {
    window.localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_RELEASE_VERSION ?? '0.0.0')

    render(<ChangelogNavLink />)

    expect(screen.getByRole('link', { name: 'Nouveautés' })).toBeInTheDocument()
  })
})
