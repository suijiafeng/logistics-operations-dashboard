// 省级区域按需加载：边界 GeoJSON（含地级市面）来自 public/geo/provinces/{adcode}.json（阿里 DataV，坐标 4 位小数约 10 米），
// 注册为 ECharts 地图，并建立「点是否在省内」的纬度带索引，供车辆下钻过滤与干线裁剪使用。
import echarts from './echarts'

type Position = number[]
type Polygon = Position[][]
export interface Geo { features: { properties: { name?: string; adcode?: string | number }; geometry: { type: string; coordinates: number[][][][] } }[] }
export interface Region {
  adcode: string
  geo: Geo
  /** 经度跨度 / 纬度跨度 × 0.75，与 ECharts geo 的 aspectScale 一致 */
  aspect: number
  contains(lng: number, lat: number): boolean
}

const BAND_SIZE = 0.05

// 按纬度为边建立索引：查询只扫描当前纬度可能相交的边，保留精确边界，含岛屿和内环。
function prepareRing(points: Position[]) {
  const bands = new Map<number, [Position, Position][]>()
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j]!, b = points[i]!
    const first = Math.floor(Math.min(a[1]!, b[1]!) / BAND_SIZE)
    const last = Math.floor(Math.max(a[1]!, b[1]!) / BAND_SIZE)
    for (let band = first; band <= last; band++) {
      const edges = bands.get(band) ?? []
      edges.push([a, b])
      bands.set(band, edges)
    }
  }
  return (x: number, y: number): -1 | 0 | 1 => {
    let inside = false
    for (const [a, b] of bands.get(Math.floor(y / BAND_SIZE)) ?? []) {
      const cross = (x - a[0]!) * (b[1]! - a[1]!) - (y - a[1]!) * (b[0]! - a[0]!)
      if (Math.abs(cross) < 1e-10 &&
        x >= Math.min(a[0]!, b[0]!) - 1e-10 && x <= Math.max(a[0]!, b[0]!) + 1e-10 &&
        y >= Math.min(a[1]!, b[1]!) - 1e-10 && y <= Math.max(a[1]!, b[1]!) + 1e-10) return 0
      if ((a[1]! > y) !== (b[1]! > y) && x < a[0]! + (y - a[1]!) * (b[0]! - a[0]!) / (b[1]! - a[1]!)) inside = !inside
    }
    return inside ? 1 : -1
  }
}

function buildContains(geo: Geo) {
  const polygons = geo.features.flatMap((feature) => {
    const geometry = feature.geometry
    return (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as unknown as Polygon[]
  }).map((polygon) => {
    const outer = polygon[0]!
    let minX = 180, maxX = -180, minY = 90, maxY = -90
    for (const p of outer) { minX = Math.min(minX, p[0]!); maxX = Math.max(maxX, p[0]!); minY = Math.min(minY, p[1]!); maxY = Math.max(maxY, p[1]!) }
    return { minX, maxX, minY, maxY, rings: polygon.map(prepareRing) }
  })
  return (lng: number, lat: number) => polygons.some((polygon) => {
    if (lng < polygon.minX || lng > polygon.maxX || lat < polygon.minY || lat > polygon.maxY) return false
    if (polygon.rings[0]!(lng, lat) < 0) return false
    return !polygon.rings.slice(1).some((hole) => hole(lng, lat) > 0)
  })
}

export function geoAspect(geo: Geo) {
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90
  for (const f of geo.features) for (const poly of f.geometry.type === 'Polygon' ? [f.geometry.coordinates as unknown as number[][][]] : f.geometry.coordinates)
    for (const ring of poly) for (const [x, y] of ring) { x0 = Math.min(x0, x!); x1 = Math.max(x1, x!); y0 = Math.min(y0, y!); y1 = Math.max(y1, y!) }
  return ((x1 - x0) / (y1 - y0)) * 0.75
}

const regions = new Map<string, Promise<Region>>()

export function loadRegion(adcode: string): Promise<Region> {
  let pending = regions.get(adcode)
  if (!pending) {
    pending = (async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}geo/provinces/${adcode}.json`)
      if (!res.ok) throw new Error(`省界数据 ${adcode} 加载失败：HTTP ${res.status}`)
      const geo = await res.json() as Geo
      echarts.registerMap(adcode, geo as never)
      return { adcode, geo, aspect: geoAspect(geo), contains: buildContains(geo) }
    })()
    pending.catch(() => regions.delete(adcode))
    regions.set(adcode, pending)
  }
  return pending
}
