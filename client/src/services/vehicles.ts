// 单车详情按需查询（引擎 /vehicles/:plate），与 1Hz 增量包解耦；车牌与扁平数组下标一一对应：粤A·10000 → 下标 0
const apiBase = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')

export interface VehicleDetail {
  plate: string
  status: number
  fromId: string
  toId: string
  routeIndex: number
  position: [number, number]
  heading: number
  speedKmh: number
  routeKm: number
  traveledKm: number
  remainingKm: number
  etaMin: number | null
  ts: number
}

export const PLATE_BASE = 10000
/** 扁平数组第三位 = 状态 × ROUTE_CODE + 线路下标（与引擎一致） */
export const ROUTE_CODE = 100
export function statusOf(code: number) { return Math.floor(code / ROUTE_CODE) }
export function routeOf(code: number) { return code % ROUTE_CODE }

export function plateOf(index: number) { return `粤A·${PLATE_BASE + index}` }

/** 车牌 → 车辆下标；接受「粤A·10000」「粤A10000」「10000」等写法，无效返回 -1 */
export function indexOfPlate(input: string, count: number) {
  const digits = input.replace(/\s/g, '').match(/(\d{5,})$/)?.[1]
  if (!digits) return -1
  const index = Number(digits) - PLATE_BASE
  return Number.isInteger(index) && index >= 0 && index < count ? index : -1
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
function isDetail(v: unknown): v is VehicleDetail {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return typeof d.plate === 'string' && finite(d.status) && typeof d.fromId === 'string' && typeof d.toId === 'string' &&
    Number.isInteger(d.routeIndex) && Array.isArray(d.position) && d.position.length === 2 && d.position.every(finite) &&
    finite(d.heading) && finite(d.speedKmh) && finite(d.routeKm) && finite(d.traveledKm) && finite(d.remainingKm) &&
    (d.etaMin === null || finite(d.etaMin))
}

export async function fetchVehicle(plate: string, signal?: AbortSignal): Promise<VehicleDetail | null> {
  const res = await fetch(`${apiBase}/vehicles/${encodeURIComponent(plate)}`, { signal })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`车辆接口返回 HTTP ${res.status}`)
  const body: unknown = await res.json()
  if (!isDetail(body)) throw new Error('车辆数据格式不正确')
  return body
}
