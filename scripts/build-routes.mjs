// 离线生成干线真实道路折线：对 server/src/network.js 里的每条干线调用 OSRM 公共路径服务，
// 取驾车路线几何，抽稀后写入 client 与 server 各一份静态 JSON。运行时不再访问任何地图服务。
//
//   node scripts/build-routes.mjs            # 全部重算
//   node scripts/build-routes.mjs gz-sz      # 只重算某条（起点-终点 id）
//
// 需要联网；走系统代理时加 NODE_USE_ENV_PROXY=1。OSRM 演示服务有限流，脚本串行并间隔 1 秒。
// 路线数据 © OpenStreetMap contributors (ODbL)，路径计算由 Project OSRM 演示服务提供。
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROUTES, hubById } from '../server/src/network.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUTS = [
  resolve(root, 'client/src/assets/geo/routes.json'),
  resolve(root, 'server/src/data/routes.json'),
]
const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org'
// 抽稀容差（度）：约 30 米，城市级视图一像素约 20–50 米，再细只增加体积
const TOLERANCE = 0.0003
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function perpendicular(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Douglas–Peucker 抽稀，保留首尾 */
function simplify(points, tolerance) {
  if (points.length <= 2) return points
  let maxDist = 0, index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicular(points[i], points[0], points[points.length - 1])
    if (d > maxDist) { maxDist = d; index = i }
  }
  if (maxDist <= tolerance) return [points[0], points[points.length - 1]]
  const left = simplify(points.slice(0, index + 1), tolerance)
  const right = simplify(points.slice(index), tolerance)
  return left.slice(0, -1).concat(right)
}

function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371, rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

async function fetchRoute(a, b) {
  const url = `${OSRM}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&steps=false`
  const res = await fetch(url, { headers: { 'User-Agent': 'logistics-viz-screen/1.0 (personal project)' } })
  if (!res.ok) throw new Error(`OSRM ${res.status} for ${a.id}-${b.id}`)
  const json = await res.json()
  if (json.code !== 'Ok' || !json.routes?.[0]) throw new Error(`OSRM ${json.code} for ${a.id}-${b.id}`)
  const route = json.routes[0]
  return { coords: route.geometry.coordinates, distanceM: route.distance, durationS: route.duration }
}

const only = new Set(process.argv.slice(2))
const existing = existsSync(OUTPUTS[1]) ? JSON.parse(readFileSync(OUTPUTS[1], 'utf8')) : []
const byId = new Map(existing.map((r) => [r.id, r]))
const result = []
for (const [fromId, toId] of ROUTES) {
  const id = `${fromId}-${toId}`
  if (only.size && !only.has(id) && byId.has(id)) { result.push(byId.get(id)); continue }
  const a = hubById[fromId], b = hubById[toId]
  const { coords, distanceM, durationS } = await fetchRoute(a, b)
  const simplified = simplify(coords, TOLERANCE).map(([lng, lat]) => [+lng.toFixed(5), +lat.toFixed(5)])
  // 首尾钉到网点坐标，保证车辆到站落在网点点位上
  simplified[0] = [+a.lng.toFixed(5), +a.lat.toFixed(5)]
  simplified[simplified.length - 1] = [+b.lng.toFixed(5), +b.lat.toFixed(5)]
  let polylineKm = 0
  for (let i = 1; i < simplified.length; i++) polylineKm += haversineKm(simplified[i - 1], simplified[i])
  const entry = { id, fromId, toId, distanceKm: +(distanceM / 1000).toFixed(1), durationMin: Math.round(durationS / 60), coords: simplified }
  result.push(entry)
  console.log(`${id.padEnd(8)} ${a.name}→${b.name}  ${entry.distanceKm} km  ${entry.durationMin} min  ${coords.length} → ${simplified.length} 点  折线 ${polylineKm.toFixed(1)} km`)
  await sleep(1000)
}

const body = JSON.stringify(result)
for (const out of OUTPUTS) {
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, body)
}
console.log(`写入 ${result.length} 条干线，${(body.length / 1024).toFixed(1)} KB → ${OUTPUTS.join(', ')}`)
