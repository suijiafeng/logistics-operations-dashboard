// 干线真实道路折线（scripts/build-routes.mjs 离线生成，OSM 数据 © OpenStreetMap contributors）
// 全国视图一像素约 60 公里、广东视图约 1 公里，按视图抽稀后再交给 ECharts，避免全国图画 1.8 万个点。
import { ROUTES } from '../data/network'

type Point = [number, number]
export interface RouteEntry { id: string; fromId: string; toId: string; distanceKm: number; durationMin: number; coords: Point[] }

/** 按 ROUTES 顺序的完整折线与里程；由 loadRoutes() 填充（约 125 KB gzip，独立分块按需加载，不进主包） */
export const ROUTE_GEOMETRY: RouteEntry[] = []
let loading: Promise<void> | undefined
export function loadRoutes(): Promise<void> {
  loading ??= import('../assets/geo/routes.json').then((mod) => {
    const byId = new Map((mod.default as RouteEntry[]).map((r) => [r.id, r]))
    ROUTE_GEOMETRY.length = 0
    for (const [a, b] of ROUTES) {
      const entry = byId.get(`${a}-${b}`)
      if (!entry) throw new Error(`routes.json 缺少干线 ${a}-${b}`)
      ROUTE_GEOMETRY.push(entry)
    }
  })
  return loading
}

function perpendicular(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Douglas–Peucker 抽稀（迭代实现，长线路不爆栈），保留首尾 */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2 || tolerance <= 0) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    let maxDist = 0, index = -1
    for (let i = first + 1; i < last; i++) {
      const d = perpendicular(points[i]!, points[first]!, points[last]!)
      if (d > maxDist) { maxDist = d; index = i }
    }
    if (index > 0 && maxDist > tolerance) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, i) => keep[i] === 1)
}

/** 视图对应的抽稀容差（度）：全国约 1 公里、省级约 100 米 */
function tolerance(view: string) { return view === 'china' ? 0.01 : 0.001 }
const cache = new Map<string, Point[]>()

/** 未加载完成时返回空数组，地图在 loadRoutes() 后重建 */
export function routeCoords(index: number, view: string): Point[] {
  const geometry = ROUTE_GEOMETRY[index]
  if (!geometry) return []
  const key = `${view}:${index}`
  let coords = cache.get(key)
  if (!coords) {
    coords = simplify(geometry.coords, tolerance(view))
    cache.set(key, coords)
  }
  return coords
}
