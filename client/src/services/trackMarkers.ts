import type { DemoTrackPoint } from '../data/deliveryTracks'
import { haversineMeters, STAY_RADIUS_METERS, type Stay } from './trackGeometry'

export interface TrackMarker {
  lng: number
  lat: number
  kind: 'origin' | 'transfer' | 'destination' | 'stay'
  text: string
}

const ROLE_TEXT = { origin: '起点', transfer: '中转', destination: '终点' } as const

export function stayPlaceName(points: DemoTrackPoint[], stay: Stay): string {
  for (let i = stay.startIndex; i <= stay.endIndex; i++) {
    const name = points[i]?.name
    if (name) return name
  }
  return '途中'
}

function stayMinutes(stay: Stay) {
  return Math.round(stay.durationMs / 60_000)
}

/** 起点、中转、终点，以及没有落在这些点上的停留。中转若同时是停留，文案带上分钟数。 */
export function trackMarkers(points: DemoTrackPoint[], stays: Stay[]): TrackMarker[] {
  const markers: TrackMarker[] = []
  points.forEach((point, index) => {
    if (!point.role) return
    const stay = stays.find((item) => index >= item.startIndex && index <= item.endIndex)
    const place = point.name || ROLE_TEXT[point.role]
    let text = point.role === 'transfer' ? place : `${ROLE_TEXT[point.role]} ${place}`
    if (stay && point.role === 'transfer') text = `${place} · 停留 ${stayMinutes(stay)} 分钟`
    markers.push({ lng: point.lng, lat: point.lat, kind: point.role, text })
  })
  for (const stay of stays) {
    const anchor = { lng: stay.lng, lat: stay.lat }
    const covered = points.some((point) => point.role && haversineMeters(point, anchor) <= STAY_RADIUS_METERS)
    if (covered) continue
    markers.push({ lng: stay.lng, lat: stay.lat, kind: 'stay', text: `停留 ${stayMinutes(stay)} 分钟` })
  }
  return markers
}
