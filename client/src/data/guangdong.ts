import geo from '../assets/geo/guangdong.json'

type Position = number[]
type Polygon = Position[][]
const BAND_SIZE = 0.05

// 按纬度为边建立索引：查询只扫描当前纬度可能相交的边，保留精确边界，含岛屿和内环。
function prepareRing(points: Position[]) {
  const bands = new Map<number, [Position, Position][]>()
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j]
    const b = points[i]
    const first = Math.floor(Math.min(a[1], b[1]) / BAND_SIZE)
    const last = Math.floor(Math.max(a[1], b[1]) / BAND_SIZE)
    for (let band = first; band <= last; band++) {
      const edges = bands.get(band) ?? []
      edges.push([a, b])
      bands.set(band, edges)
    }
  }
  return (x: number, y: number): -1 | 0 | 1 => {
    let inside = false
    for (const [a, b] of bands.get(Math.floor(y / BAND_SIZE)) ?? []) {
      const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0])
      if (Math.abs(cross) < 1e-10 &&
        x >= Math.min(a[0], b[0]) - 1e-10 && x <= Math.max(a[0], b[0]) + 1e-10 &&
        y >= Math.min(a[1], b[1]) - 1e-10 && y <= Math.max(a[1], b[1]) + 1e-10) return 0
      if ((a[1] > y) !== (b[1] > y) && x < a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) {
        inside = !inside
      }
    }
    return inside ? 1 : -1
  }
}

const polygons = geo.features.flatMap((feature) => {
  const geometry = feature.geometry
  return (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as Polygon[]
}).map((polygon) => {
  const outer = polygon[0]
  return {
    minX: Math.min(...outer.map((p) => p[0])), maxX: Math.max(...outer.map((p) => p[0])),
    minY: Math.min(...outer.map((p) => p[1])), maxY: Math.max(...outer.map((p) => p[1])),
    rings: polygon.map(prepareRing),
  }
})

export function inGuangdong(lng: number, lat: number) {
  return polygons.some((polygon) => {
    if (lng < polygon.minX || lng > polygon.maxX || lat < polygon.minY || lat > polygon.maxY) return false
    if (polygon.rings[0](lng, lat) < 0) return false
    return !polygon.rings.slice(1).some((hole) => hole(lng, lat) > 0)
  })
}

export default geo
