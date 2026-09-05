import Image from 'next/image'

import { staticMap } from '@/lib/maps'
import { cn } from '@/lib/utils'

import type { GeoPoint } from '@/lib/maps'

interface StaticMapProps {
  point: GeoPoint
  /** Nom du lieu, pour l'alternative textuelle */
  label: string
  zoom?: number
  className?: string
}

/**
 * Mini-carte sans JavaScript ni clé d'API : quatre tuiles OpenStreetMap et un
 * repère posé en pourcentage. La licence ODbL impose l'attribution affichée.
 */
export function StaticMap({ point, label, zoom, className }: StaticMapProps) {
  const map = staticMap(point, zoom)

  return (
    <figure
      className={cn('relative overflow-hidden rounded-lg bg-surface-2 ring-1 ring-line', className)}
    >
      <div aria-hidden="true" className="grid aspect-square grid-cols-2 grid-rows-2">
        {map.tiles.map((tile) => (
          <Image
            key={`${tile.z}/${tile.x}/${tile.y}`}
            src={tile.url}
            alt=""
            width={256}
            height={256}
            loading="lazy"
            className="size-full object-cover"
          />
        ))}
      </div>

      <span
        aria-hidden="true"
        style={{ left: `${map.marker.left}%`, top: `${map.marker.top}%` }}
        className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-veto shadow-md"
      />

      <figcaption className="absolute inset-x-0 bottom-0 flex justify-between gap-2 bg-surface/85 px-2 py-1 text-[0.65rem] text-muted-foreground">
        <span className="truncate">{label}</span>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 underline underline-offset-2"
        >
          © OpenStreetMap
        </a>
      </figcaption>
    </figure>
  )
}
