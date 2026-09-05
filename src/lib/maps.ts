/**
 * Géolocalisation : lecture du point stocké en base, lien d'itinéraire et
 * découpe d'une mini-carte statique en tuiles OpenStreetMap.
 *
 * Tout est pur : aucune clé d'API, aucune requête ici. L'affichage se contente
 * de quatre `<img>` et d'un repère positionné en pourcentage.
 */
import { z } from 'zod'

import type { Json } from '@/data-access/models'

const GeoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export type GeoPoint = z.infer<typeof GeoPointSchema>

/** `null` si la donnée est absente ou hors bornes. */
export function parseGeoPoint(value: Json | null | undefined): GeoPoint | null {
  const parsed = GeoPointSchema.safeParse(value)
  return parsed.success ? { lat: parsed.data.lat, lng: parsed.data.lng } : null
}

export interface PlaceLike {
  name: string
  address?: string | null
  city?: string | null
  location?: Json | null
}

/**
 * Lien « Itinéraire » universel : Google Maps l'ouvre dans l'application native
 * sur mobile et dans le navigateur ailleurs. Les coordonnées priment sur
 * l'adresse ; sans l'une ni l'autre il n'y a pas d'itinéraire à proposer — un
 * nom seul enverrait le groupe n'importe où.
 */
export function directionsUrl(place: PlaceLike): string | null {
  const point = parseGeoPoint(place.location)
  const address = place.address?.trim()
  if (!point && !address) return null

  const destination = point
    ? `${point.lat},${point.lng}`
    : [place.name, address, place.city].filter(Boolean).join(', ')

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

export interface MapTile {
  z: number
  x: number
  y: number
  url: string
}

export interface StaticMap {
  zoom: number
  /** Bloc de 2×2 tuiles, dans l'ordre de lecture (ligne du haut puis du bas) */
  tiles: MapTile[]
  /** Position du repère dans le bloc, en pourcentage */
  marker: { left: number; top: number }
}

const TILE_HOST = 'https://tile.openstreetmap.org'
/** Bornes de la projection Web Mercator */
const MAX_LATITUDE = 85.05112878
const MIN_ZOOM = 1
const MAX_ZOOM = 19

/**
 * Découpe un bloc de 2×2 tuiles autour du point. Le bloc est choisi pour que le
 * repère tombe toujours entre 25 % et 75 % : le lieu reste visible et entouré
 * de son quartier, sans jamais coller à un bord.
 */
export function staticMap(point: GeoPoint, zoom = 15): StaticMap {
  const z = Math.min(Math.max(Math.round(zoom), MIN_ZOOM), MAX_ZOOM)
  const scale = 2 ** z

  const latitude = Math.min(Math.max(point.lat, -MAX_LATITUDE), MAX_LATITUDE)
  const latitudeRad = (latitude * Math.PI) / 180
  const x = (((((point.lng + 180) % 360) + 360) % 360) / 360) * scale
  const y =
    ((1 - Math.log(Math.tan(latitudeRad) + 1 / Math.cos(latitudeRad)) / Math.PI) / 2) * scale

  const originX = Math.floor(x - 0.5)
  // Pas d'enroulement vertical : les tuiles s'arrêtent aux pôles.
  const originY = Math.min(Math.max(Math.floor(y - 0.5), 0), scale - 2)

  const tiles: MapTile[] = []
  for (let offsetY = 0; offsetY < 2; offsetY++) {
    for (let offsetX = 0; offsetX < 2; offsetX++) {
      // Le monde est cylindrique : la colonne s'enroule d'un bord à l'autre.
      const tileX = (((originX + offsetX) % scale) + scale) % scale
      const tileY = originY + offsetY
      tiles.push({ z, x: tileX, y: tileY, url: `${TILE_HOST}/${z}/${tileX}/${tileY}.png` })
    }
  }

  return {
    zoom: z,
    tiles,
    marker: { left: ((x - originX) / 2) * 100, top: ((y - originY) / 2) * 100 },
  }
}
