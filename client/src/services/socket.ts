import { useDashboardStore } from '../stores/dashboard'

// 数据链路：先 HTTP 拉全量快照（12,000 台车辆位置 + 全部统计），再连 WebSocket 收 1 秒聚合的增量包
let ws: WebSocket | null = null
let reconnectTimer: number | undefined

async function loadSnapshot() {
  const store = useDashboardStore()
  const res = await fetch('/api/snapshot')
  if (!res.ok) throw new Error(`snapshot ${res.status}`)
  const msg = await res.json()
  if (msg.type === 'snapshot') store.applySnapshot(msg)
}

function connectWs() {
  const store = useDashboardStore()
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/ws`)
  ws.onopen = () => {
    store.connected = true
  }
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string)
      if (msg.type === 'delta') {
        store.applyDelta(msg, (ev.data as string).length / 1024)
      }
    } catch {
      // 单包解析失败不中断链路
    }
  }
  ws.onclose = () => {
    store.connected = false
    reconnectTimer = window.setTimeout(connectWs, 2000)
  }
  ws.onerror = () => ws?.close()
}

export async function startDataFeed() {
  const store = useDashboardStore()
  try {
    await loadSnapshot()
  } catch (e) {
    console.error('快照加载失败，稍后随重连重试', e)
    window.setTimeout(startDataFeed, 3000)
    return
  }
  connectWs()
  // 快照兜底刷新：每 60 秒重拉一次，防止 WS 断线期间状态漂移
  window.setInterval(() => {
    if (!store.connected) loadSnapshot().catch(() => {})
  }, 60_000)
}

export function stopDataFeed() {
  if (reconnectTimer) window.clearTimeout(reconnectTimer)
  ws?.close()
}
