import { useDashboardStore, type DeltaMsg, type SnapshotMsg } from '../stores/dashboard'
import { ROUTES } from '../data/network'

// 数据链路：先 HTTP 拉全量快照（12,000 台车辆位置 + 全部统计），再连 WebSocket 收 1 秒聚合的增量包
let ws: WebSocket | null = null
let reconnectTimer: number | undefined
let fallbackTimer: number | undefined
let reconnectAttempt = 0
let started = false
let stopped = true
let generation = 0
const requests = new Set<AbortController>()

const apiBase = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')
const snapshotUrl = `${apiBase}/snapshot`

function websocketUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasKpi(value: unknown) {
  if (!isRecord(value)) return false
  return ['enRoute', 'ordersToday', 'onTimeRate', 'pendingAnomalies'].every(
    (key) => typeof value[key] === 'number' && Number.isFinite(value[key]),
  )
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const optional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v)
const isString = (v: unknown) => typeof v === 'string'

// 校验覆盖界面实际读取的每个字段：网点统计会直接参与 toFixed / 格式化 / 排序，类型不对会在渲染时报错
function validHub(h: unknown, full: boolean) {
  if (!isRecord(h) || typeof h.id !== 'string') return false
  const identity = full
    ? isString(h.name) && finite(h.lng) && finite(h.lat) && finite(h.level)
    : optional(h.name, isString) && optional(h.lng, finite) && optional(h.lat, finite) && optional(h.level, finite)
  return identity &&
    ['arrivals', 'departures', 'backlog', 'utilization', 'onTime'].every(k => optional(h[k], n => finite(n) && n >= 0)) &&
    optional(h.recentOrders, items => Array.isArray(items) && items.every(n => finite(n) && n >= 0)) &&
    optional(h.recentLabels, items => Array.isArray(items) && items.every(isString)) &&
    optional(h.routeOrders, o => isRecord(o) && Object.values(o).every(n => finite(n) && n >= 0))
}

// 线路下标必须是有效整数下标：0.5、-1、越界值都会让地图取不到线路
const isRouteIndex = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < ROUTES.length

function validStats(value: Record<string, unknown>, fullHubs: boolean) {
  const named = (items: unknown) => Array.isArray(items) && items.every(n => isRecord(n) && isString(n.name) && finite(n.value) &&
    ['id', 'fromId', 'toId'].every(k => optional(n[k], isString)))
  const events = value.events
  return Array.isArray(value.trend) && value.trend.length === 24 && value.trend.every(n => n === null || finite(n) && n >= 0) &&
    optional(value.trendYesterday, t => Array.isArray(t) && t.length === 24 && t.every(n => finite(n) && n >= 0)) &&
    ['modes', 'punctuality', 'routeVolumes'].every(k => named(value[k])) &&
    Array.isArray(value.hubs) && value.hubs.every(h => validHub(h, fullHubs)) &&
    (events === undefined || Array.isArray(events) && events.every(e => isRecord(e) && finite(e.id) &&
      ['time', 'type', 'vehicle', 'place', 'desc'].every(k => isString(e[k])) && finite(e.level) &&
      ['fromId', 'toId'].every(k => optional(e[k], isString)) && optional(e.routeIndex, isRouteIndex) &&
      optional(e.position, p => Array.isArray(p) && p.length === 2 && p.every(finite))))
}

function isSnapshotMsg(value: unknown): value is SnapshotMsg {
  if (!isRecord(value) || value.type !== 'snapshot') return false
  if (
    typeof value.vehicleCount !== 'number' ||
    !Number.isInteger(value.vehicleCount) ||
    value.vehicleCount < 0
  ) {
    return false
  }
  return (
    typeof value.ts === 'number' && Number.isFinite(value.ts) && validStats(value, true) &&
    Array.isArray(value.vehicles) &&
    value.vehicles.length === value.vehicleCount * 3 &&
    value.vehicles.every((item) => typeof item === 'number' && Number.isFinite(item)) &&
    Array.isArray(value.hubs) &&
    hasKpi(value.kpi) &&
    Array.isArray(value.trend) &&
    Array.isArray(value.modes) &&
    Array.isArray(value.punctuality) &&
    Array.isArray(value.routeVolumes)
  )
}

function isDeltaMsg(value: unknown): value is DeltaMsg {
  if (!isRecord(value) || value.type !== 'delta') return false
  return (
    typeof value.ts === 'number' && Number.isFinite(value.ts) && validStats(value, false) &&
    Array.isArray(value.vehicles) &&
    value.vehicles.length % 3 === 0 &&
    value.vehicles.every((item) => typeof item === 'number' && Number.isFinite(item)) &&
    Array.isArray(value.hubs) &&
    hasKpi(value.kpi) &&
    Array.isArray(value.trend) &&
    Array.isArray(value.modes) &&
    Array.isArray(value.punctuality) &&
    Array.isArray(value.routeVolumes) &&
    Array.isArray(value.events)
  )
}

async function loadSnapshot() {
  const session = generation
  const store = useDashboardStore()
  const controller = new AbortController()
  requests.add(controller)
  const timeout = window.setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(snapshotUrl, { signal: controller.signal })
    if (!res.ok) throw new Error(`快照接口返回 HTTP ${res.status}`)
    const msg: unknown = await res.json()
    if (!isSnapshotMsg(msg)) throw new Error('快照数据格式不正确')
    if (!stopped && generation === session) store.applySnapshot(msg)
  } finally {
    requests.delete(controller)
    window.clearTimeout(timeout)
  }
}

function connectWs() {
  const store = useDashboardStore()
  const socket = new WebSocket(websocketUrl())
  ws = socket
  const session = generation
  ws.onopen = () => {
    if (stopped || session !== generation) { socket.close(); return }
    reconnectAttempt = 0
    store.reconnectAttempt = 0
    store.setConnectionState('connected')
  }
  ws.onmessage = (ev) => {
    if (stopped || session !== generation) return
    try {
      const msg: unknown = JSON.parse(ev.data as string)
      if (isDeltaMsg(msg)) {
        store.applyDelta(msg, (ev.data as string).length / 1024)
      } else if (isRecord(msg) && msg.type === 'delta') {
        throw new Error('增量数据格式不正确')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知解析错误'
      store.connectionError = `实时消息解析失败：${message}`
      console.warn(store.connectionError)
    }
  }
  ws.onclose = () => {
    if (ws !== socket) return
    ws = null
    if (!stopped) scheduleReconnect('实时连接已断开')
  }
  ws.onerror = () => socket.close()
}

function scheduleReconnect(reason: string) {
  const store = useDashboardStore()
  if (stopped || reconnectTimer !== undefined) return
  reconnectAttempt++
  store.reconnectAttempt = reconnectAttempt
  const baseDelay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt - 1, 5))
  const delay = Math.round(baseDelay * (0.85 + Math.random() * 0.3))
  const state = reconnectAttempt >= 6 ? 'error' : 'reconnecting'
  store.setConnectionState(state, `${reason}，${Math.ceil(delay / 1000)} 秒后重试`)
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined
    void establishConnection()
  }, delay)
}

async function establishConnection() {
  const session = generation
  const store = useDashboardStore()
  try {
    await loadSnapshot()
    if (stopped || generation !== session) return
    connectWs()
  } catch (error) {
    if (stopped || generation !== session) return
    const message = error instanceof Error ? error.message : '未知错误'
    console.error('快照加载失败', error)
    scheduleReconnect(`快照加载失败：${message}`)
  }
}

export async function startDataFeed() {
  if (started) return
  started = true
  generation++
  const session = generation
  stopped = false
  reconnectAttempt = 0
  const store = useDashboardStore()
  store.setConnectionState('connecting')
  await establishConnection()
  if (stopped || generation !== session) return
  // 半开连接看门狗：有效数据超时即重新拉快照、建 WS；不依赖 TCP 关闭握手完成。
  fallbackTimer = window.setInterval(() => {
    if (store.connected && Date.now() - store.receivedAt > 15_000) {
      store.connectionError = '数据超过 15 秒未更新，正在重建连接'
      const stale = ws
      ws = null
      if (stale) { stale.onclose = null; stale.onerror = null; stale.close() }
      scheduleReconnect('数据流超时')
    }
  }, 5000)
}

export function stopDataFeed() {
  stopped = true
  generation++
  for (const request of requests) request.abort()
  requests.clear()
  started = false
  if (reconnectTimer !== undefined) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }
  if (fallbackTimer !== undefined) {
    window.clearInterval(fallbackTimer)
    fallbackTimer = undefined
  }
  if (ws) {
    ws.onclose = null
    ws.onerror = null
    ws.close()
    ws = null
  }
  try {
    useDashboardStore().setConnectionState('idle')
  } catch {
    // Pinia 已卸载时无需再同步展示状态
  }
}
