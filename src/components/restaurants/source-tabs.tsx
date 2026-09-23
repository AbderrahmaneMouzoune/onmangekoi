'use client'

import { cn } from '@/lib/utils'

/** D'où viennent les restos qu'on pioche : ses listes, le carnet, ou Google. */
export type RestaurantSource = 'lists' | 'base' | 'google'

export interface SourceTab {
  key: RestaurantSource
  label: string
  icon: React.ReactNode
  /** Petit compteur à droite du libellé — ce qu'on a déjà pris dans cette source. */
  count?: number
}

interface SourceTabsProps {
  tabs: SourceTab[]
  value: RestaurantSource
  onChange: (source: RestaurantSource) => void
  /** Préfixe des ids, pour relier chaque onglet à son panneau. */
  idPrefix: string
}

export function sourceTabId(idPrefix: string, source: RestaurantSource): string {
  return `${idPrefix}-tab-${source}`
}

export function sourcePanelId(idPrefix: string): string {
  return `${idPrefix}-panel`
}

/**
 * Les sources, au même niveau : un onglet chacune, dans un rail commun.
 * Aucune n'est « la principale » — on mélange, et le panier en dessous
 * garde tout ce qu'on a pris, d'où que ça vienne.
 *
 * Clavier : flèches pour passer d'un onglet à l'autre, Début / Fin pour
 * aller aux extrémités, comme un `tablist` doit le faire.
 */
export function SourceTabs({ tabs, value, onChange, idPrefix }: SourceTabsProps) {
  function moveFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.key === value)
    if (index === -1) return
    let next: number | null = null
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    if (next === null) return
    event.preventDefault()
    const target = tabs[next]
    if (!target) return
    onChange(target.key)
    document.getElementById(sourceTabId(idPrefix, target.key))?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Source des restaurants"
      onKeyDown={moveFocus}
      className="grid gap-1 rounded-lg bg-surface-2 p-1"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => {
        const isSelected = tab.key === value
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={sourceTabId(idPrefix, tab.key)}
            aria-selected={isSelected}
            aria-controls={sourcePanelId(idPrefix)}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-semibold transition-[background-color,color,box-shadow] outline-none focus-visible:ring-3 focus-visible:ring-ring [&>svg]:size-4 [&>svg]:shrink-0',
              isSelected
                ? 'bg-surface text-ink shadow-sm ring-1 ring-line'
                : 'text-ink-2 hover:text-ink'
            )}
          >
            {tab.icon}
            <span className="truncate">{tab.label}</span>
            {tab.count ? (
              // Décoratif : le panier, juste au-dessus, dit déjà ce qui est pris.
              <span
                aria-hidden="true"
                className="rounded-full bg-brand-soft px-1.5 font-mono text-[0.68rem] text-brand-hover tabular"
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
