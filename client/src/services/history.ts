// 历史回放与尾迹：引擎每 10 秒记一帧全部车辆位置，环形保留 1 小时
//   GET /history               帧时间戳列表
//   GET /history/:ts           某一帧（与实时快照同构的扁平数组，gzip）
//   GET /vehicles/:plate/trail 单车最近 1 小时各帧位置
const apiBase = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')
import { ROUTES } from '../data/network'
import { statusOf, routeOf, kindOf } from './vehicles'
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const MAX_DATE_MS = 8.64e15
const validTs = (ts: unknown): ts is number => finite(ts) && ts > 0 && ts <= MAX_DATE_MS
// 与实时增量同一套校验：整表长度、坐标范围、编码枚举
function validVehicles(arr: unknown, count: number): arr is number[] {
  if (!Array.isArray(arr) || count <= 0 || arr.length !== count * 3) return false
  for (let i = 0; i < arr.length; i += 3) {
    const lng = arr[i], lat = arr[i + 1], code = arr[i + 2]
    if (!finite(lng) || !finite(lat) || !finite(code) || lng < -180 || lng > 180 || lat < -90 || lat > 90) return false
    if (!Number.isInteger(code) || code < 0 || statusOf(code) > 2 || kindOf(code) > 1 || routeOf(code) >= ROUTES.length) return false
  }
  return true
}

export interface HistoryIndex { interval: number; frames: number[] }
export interface HistoryFrame { ts: number; vehicleCount: number; vehicles: number[]; kpi: { enRoute: number; pendingAnomalies: number } }
export type TrailPoint = [number, number, number, number] // ts, lng, lat, status
export interface VehicleTrail { plate: string; interval: number; points: TrailPoint[] }

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${apiBase}${path}`, { signal })
  if (!res.ok) throw new Error(`接口返回 HTTP ${res.status}`)
  return res.json()
}

export async function fetchHistoryIndex(signal?: AbortSignal): Promise<HistoryIndex> {
  const body = await getJson('/history', signal) as Partial<HistoryIndex>
  if (!finite(body.interval) || !Array.isArray(body.frames) || !body.frames.every(validTs)) throw new Error('历史帧列表格式不正确')
  return { interval: body.interval, frames: body.frames }
}

export async function fetchHistoryFrame(ts: number, signal?: AbortSignal): Promise<HistoryFrame> {
  const body = await getJson(`/history/${ts}`, signal) as Partial<HistoryFrame>
  if (!validTs(body.ts) || !Number.isInteger(body.vehicleCount) || !validVehicles(body.vehicles, body.vehicleCount as number) ||
    !body.kpi || !finite(body.kpi.enRoute) || !finite(body.kpi.pendingAnomalies)) throw new Error('历史帧格式不正确')
  return body as HistoryFrame
}

export interface TempSeries { plate: string; lo: number; hi: number; target: number; interval: number; samples: [number, number][]; current: number; overSince: number | null }
/** 冷链车温度序列：最近 1 小时每 10 秒一个样本；非冷链车返回 null */
export async function fetchVehicleTemps(plate: string, signal?: AbortSignal): Promise<TempSeries | null> {
  const res = await fetch(`${apiBase}/vehicles/${encodeURIComponent(plate)}/temps`, { signal })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`接口返回 HTTP ${res.status}`)
  const body = await res.json() as Partial<TempSeries>
  if (typeof body.plate !== 'string' || !finite(body.lo) || !finite(body.hi) || !finite(body.target) || !finite(body.current) ||
    !Array.isArray(body.samples) || !body.samples.every((p) => Array.isArray(p) && p.length === 2 && p.every(finite))) throw new Error('温度数据格式不正确')
  return body as TempSeries
}

export async function fetchVehicleTrail(plate: string, minutes = 60, signal?: AbortSignal): Promise<VehicleTrail> {
  const body = await getJson(`/vehicles/${encodeURIComponent(plate)}/trail?minutes=${minutes}`, signal) as Partial<VehicleTrail>
  if (typeof body.plate !== 'string' || !finite(body.interval) || !Array.isArray(body.points) ||
    !body.points.every((p) => Array.isArray(p) && p.length === 4 && validTs(p[0]) && p.every(finite) && p[3] >= 0 && p[3] <= 2)) throw new Error('尾迹格式不正确')
  return body as VehicleTrail
}
