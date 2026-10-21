// 干线真实道路几何：由 scripts/build-routes.mjs 离线生成（OSRM 驾车路线，OSM 数据），
// 这里按 ROUTES 顺序建立累计里程表，提供「沿线第 km 公里处的坐标与朝向」查询。
import { readFileSync } from 'node:fs'
import { ROUTES } from './network.js'

const raw = JSON.parse(readFileSync(new URL('./data/routes.json', import.meta.url), 'utf8'))
const byId = new Map(raw.map((r) => [r.id, r]))

const EARTH_KM = 6371
const RAD = Math.PI / 180
function haversineKm(a, b) {
  const dLat = (b[1] - a[1]) * RAD, dLng = (b[0] - a[0]) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h))
}

/** 每条干线：coords 折线、cum 各点累计公里、totalKm 全长、roadKm/roadMin 为 OSRM 给出的里程与时长 */
export const ROUTE_GEOMETRY = ROUTES.map(([fromId, toId]) => {
  const entry = byId.get(`${fromId}-${toId}`)
  if (!entry) throw new Error(`routes.json 缺少干线 ${fromId}-${toId}，请运行 node scripts/build-routes.mjs`)
  const coords = entry.coords
  const cum = new Float64Array(coords.length)
  for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1] + haversineKm(coords[i - 1], coords[i])
  return { id: entry.id, coords, cum, totalKm: cum[cum.length - 1], roadKm: entry.distanceKm, roadMin: entry.durationMin }
})

export function routeKm(routeIdx) {
  return ROUTE_GEOMETRY[routeIdx].totalKm
}

/** 找到 km 所在线段下标 i（cum[i] <= km < cum[i+1]），二分查找 */
function segmentAt(geom, km) {
  const { cum } = geom
  let lo = 0, hi = cum.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cum[mid] <= km) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** 沿线从起点算起 km 公里处的 [lng, lat]；越界钳制到首尾 */
export function pointAtKm(routeIdx, km) {
  const geom = ROUTE_GEOMETRY[routeIdx]
  const { coords, cum, totalKm } = geom
  if (km <= 0) return [coords[0][0], coords[0][1]]
  if (km >= totalKm) { const last = coords[coords.length - 1]; return [last[0], last[1]] }
  const i = segmentAt(geom, km)
  const span = cum[i + 1] - cum[i]
  const t = span > 0 ? (km - cum[i]) / span : 0
  const a = coords[i], b = coords[i + 1]
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** km 处的行驶朝向（0 = 正北，顺时针，度）；dir=-1 时反向 */
export function headingAtKm(routeIdx, km, dir = 1) {
  const geom = ROUTE_GEOMETRY[routeIdx]
  const { coords, totalKm } = geom
  const i = segmentAt(geom, Math.min(Math.max(km, 0), Math.max(totalKm - 1e-6, 0)))
  const a = coords[i], b = coords[i + 1] ?? coords[i]
  const [from, to] = dir === 1 ? [a, b] : [b, a]
  const dLng = (to[0] - from[0]) * Math.cos(((from[1] + to[1]) / 2) * RAD)
  const dLat = to[1] - from[1]
  const deg = Math.atan2(dLng, dLat) / RAD
  return (deg + 360) % 360
}
