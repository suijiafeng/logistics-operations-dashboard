import { useDashboardStore, type DeltaMsg, type SnapshotMsg } from '../stores/dashboard'

// 数据链路：先 HTTP 拉全量快照（12,000 台车辆位置 + 全部统计），再连 WebSocket 收 1 秒聚合的增量包
let ws: WebSocket | null = null
let reconnectTimer: number | undefined
let fallbackTimer: number | undefined
let reconnectAttempt = 0
let started = false
let stopped = true

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
    (key) => typeof value[key] === 'number',
  )
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
    typeof value.ts === 'number' &&
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
    typeof value.ts === 'number' &&
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
  const store = useDashboardStore()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(snapshotUrl, { signal: controller.signal })
    if (!res.ok) throw new Error(`快照接口返回 HTTP ${res.status}`)
    const msg: unknown = await res.json()
    if (!isSnapshotMsg(msg)) throw new Error('快照数据格式不正确')
    store.applySnapshot(msg)
  } finally {
    window.clearTimeout(timeout)
  }
}

function connectWs() {
  const store = useDashboardStore()
  ws = new WebSocket(websocketUrl())
  ws.onopen = () => {
    reconnectAttempt = 0
    store.setConnectionState('connected')
  }
  ws.onmessage = (ev) => {
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
    ws = null
    if (!stopped) scheduleReconnect('实时连接已断开')
  }
  ws.onerror = () => ws?.close()
}

function scheduleReconnect(reason: string) {
  const store = useDashboardStore()
  if (stopped || reconnectTimer !== undefined) return
  reconnectAttempt++
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
  const store = useDashboardStore()
  try {
    await loadSnapshot()
    if (stopped) return
    connectWs()
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    console.error('快照加载失败', error)
    scheduleReconnect(`快照加载失败：${message}`)
  }
}

export async function startDataFeed() {
  if (started) return
  started = true
  stopped = false
  reconnectAttempt = 0
  const store = useDashboardStore()
  store.setConnectionState('connecting')
  await establishConnection()
  if (stopped) return
  // 快照兜底刷新：断线期间每 60 秒尝试校准一次状态；失败时保留现有数据并展示原因
  fallbackTimer = window.setInterval(() => {
    if (!store.connected) {
      loadSnapshot().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '未知错误'
        store.connectionError = `快照校准失败：${message}`
      })
    }
  }, 60_000)
}

export function stopDataFeed() {
  stopped = true
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
