// 把高德行政区查询结果收成标注。features 里的 point 会把商户 POI 一起打开，所以地名单独画。

export interface AdminNode {
  name: string
  level: string
  center: [number, number]
  children: AdminNode[]
}

export interface AdminLabel {
  name: string
  position: [number, number]
  zooms: [number, number]
  rank: number
  fontSize: number
}

export interface RawDistrict {
  name?: string
  level?: string
  center?: unknown
  districtList?: RawDistrict[]
}

/** 当前轨迹经过的地级市。同级碰撞时这些市和它们的区县优先留下来。 */
const PRIORITY_CITIES = new Set(['广州市', '深圳市', '东莞市', '佛山市'])

const LEVELS: Record<string, { zooms: [number, number]; rank: number; fontSize: number }> = {
  province: { zooms: [4, 8], rank: 300, fontSize: 16 },
  city: { zooms: [7, 18], rank: 200, fontSize: 15 },
  district: { zooms: [9, 15], rank: 40, fontSize: 12 },
  street: { zooms: [13, 18], rank: 8, fontSize: 12 },
}

export function parseCenter(center: unknown): [number, number] | null {
  if (typeof center === 'string') {
    const [lng, lat] = center.split(',').map(Number)
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat]
    return null
  }
  if (Array.isArray(center) && center.length >= 2) {
    const lng = Number(center[0])
    const lat = Number(center[1])
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat]
    return null
  }
  if (center && typeof center === 'object') {
    const point = center as { lng?: number; lat?: number; getLng?: () => number; getLat?: () => number }
    const lng = typeof point.getLng === 'function' ? point.getLng() : point.lng
    const lat = typeof point.getLat === 'function' ? point.getLat() : point.lat
    if (typeof lng === 'number' && typeof lat === 'number' && Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat]
  }
  return null
}

export function normalizeDistricts(nodes: RawDistrict[] | undefined): AdminNode[] {
  const out: AdminNode[] = []
  for (const node of nodes ?? []) {
    const center = parseCenter(node.center)
    if (!node.name || !node.level || !center) continue
    out.push({ name: node.name, level: node.level, center, children: normalizeDistricts(node.districtList) })
  }
  return out
}

/** 省、市在中等比例尺一直可见；区县从轨迹常用视野就开始出现；乡镇只在放大后出现。 */
export function adminLabelsFromTree(nodes: AdminNode[]): AdminLabel[] {
  const labels: AdminLabel[] = []
  const walk = (node: AdminNode, city?: string) => {
    const spec = LEVELS[node.level]
    const centerOk = Number.isFinite(node.center[0]) && Number.isFinite(node.center[1])
    if (spec && centerOk) {
      const priorityCity = node.level === 'city' && PRIORITY_CITIES.has(node.name)
      const priorityDistrict = node.level === 'district' && !!city && PRIORITY_CITIES.has(city)
      const skipStreet = node.level === 'street' && !(city && PRIORITY_CITIES.has(city))
      if (!skipStreet) {
        labels.push({
          name: node.name,
          position: node.center,
          zooms: spec.zooms,
          rank: priorityCity ? 500 : priorityDistrict ? 80 : spec.rank,
          fontSize: spec.fontSize,
        })
      }
    }
    const nextCity = node.level === 'city' ? node.name : city
    for (const child of node.children) walk(child, nextCity)
  }
  for (const node of nodes) walk(node)
  return labels
}
