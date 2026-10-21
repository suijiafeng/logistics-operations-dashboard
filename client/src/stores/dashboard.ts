import { defineStore } from 'pinia'
import type { Hub } from '../data/network'
import { HUBS } from '../data/network'

export interface Kpi {
  enRoute: number
  ordersToday: number
  onTimeRate: number
  pendingAnomalies: number
}

export interface AnomalyEvent {
  id: number
  time: string
  type: string
  vehicle: string
  place: string
  desc: string
  level: number // 0 普通 1 警告 2 严重
}

export interface NameValue {
  name: string
  value: number
}

export interface SnapshotMsg {
  type: 'snapshot'
  ts: number
  vehicleCount: number
  vehicles: number[]
  hubs: Hub[]
  kpi: Kpi
  trend: (number | null)[]
  modes: NameValue[]
  punctuality: NameValue[]
  routeVolumes: NameValue[]
}

export interface DeltaMsg {
  type: 'delta'
  ts: number
  vehicles: number[]
  hubs: { id: string }[]
  kpi: Kpi
  trend: (number | null)[]
  modes: NameValue[]
  punctuality: NameValue[]
  routeVolumes: NameValue[]
  events: AnomalyEvent[]
}

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    connected: false,
    connectionState: 'connecting' as 'connecting' | 'connected' | 'reconnecting' | 'error' | 'idle',
    connectionError: '',
    reconnectAttempt: 0,
    dataAt: 0,
    receivedAt: 0,
    checkedAt: Date.now(),
    vehicleCount: 0,
    // 扁平数组 [lng, lat, status] * N，由推送整包替换引用（不在响应式里逐项改）
    vehicles: [] as number[],
    // 地图渲染版本号：delta 到达后 +1，地图组件在 rAF 里检查后才重绘（帧合并）
    mapVersion: 0,
    // 图表版本号：1Hz 节奏即可
    chartVersion: 0,
    hubs: HUBS.map((h) => ({ ...h })) as Hub[],
    kpi: { enRoute: 0, ordersToday: 0, onTimeRate: 0, pendingAnomalies: 0 } as Kpi,
    trend: [] as (number | null)[],
    modes: [] as NameValue[],
    punctuality: [] as NameValue[],
    routeVolumes: [] as NameValue[],
    events: [] as AnomalyEvent[],
    selectedHubId: null as string | null,
    view: 'china' as 'china' | 'guangdong',
    hudOn: false,
    decorationsOn: true,
    lastDeltaKB: 0,
    lastDeltaAt: 0,
    latencyMs: 0,
    deltaCount: 0,
  }),
  getters: {
    hasData(state): boolean { return state.receivedAt > 0 },
    dataStatus(state): 'loading' | 'error' | 'stale' | 'ready' {
      if (!state.receivedAt) return state.connectionError ? 'error' : 'loading'
      return !state.connected || !!state.connectionError || state.checkedAt - state.receivedAt > 5000 ? 'stale' : 'ready'
    },
    selectedHub(state): Hub | undefined {
      return state.hubs.find((h) => h.id === state.selectedHubId)
    },
    topHubs(state): Hub[] {
      return [...state.hubs]
        .sort((a, b) => (b.arrivals ?? 0) + (b.departures ?? 0) - ((a.arrivals ?? 0) + (a.departures ?? 0)))
        .slice(0, 5)
    },
  },
  actions: {
    applySnapshot(msg: SnapshotMsg) {
      this.receivedAt = this.checkedAt = Date.now()
      this.connectionError = ''
      this.dataAt = msg.ts
      this.vehicleCount = msg.vehicleCount
      this.vehicles = msg.vehicles
      this.hubs = msg.hubs
      this.kpi = msg.kpi
      this.trend = msg.trend
      this.modes = msg.modes
      this.punctuality = msg.punctuality
      this.routeVolumes = msg.routeVolumes
      this.mapVersion++
      this.chartVersion++
    },
    applyDelta(msg: DeltaMsg, payloadKB: number) {
      this.receivedAt = this.checkedAt = Date.now()
      this.connectionError = ''
      this.dataAt = msg.ts
      this.vehicles = msg.vehicles
      // 网点统计按 id 合并，不整表替换（保留对象引用稳定）
      const byId = new Map(this.hubs.map((h) => [h.id, h]))
      for (const hs of msg.hubs) {
        const hub = byId.get(hs.id)
        if (hub) Object.assign(hub, hs)
      }
      this.kpi = msg.kpi
      this.trend = msg.trend
      this.modes = msg.modes
      this.punctuality = msg.punctuality
      this.routeVolumes = msg.routeVolumes
      if (msg.events.length) {
        this.events = [...[...msg.events].reverse(), ...this.events].slice(0, 30)
      }
      this.lastDeltaKB = payloadKB
      this.latencyMs = Math.max(0, Date.now() - msg.ts)
      this.lastDeltaAt = Date.now()
      this.deltaCount++
      this.mapVersion++
      this.chartVersion++
    },
    selectHub(id: string | null) {
      this.selectedHubId = id
    },
    setView(v: 'china' | 'guangdong') {
      this.view = v
      this.mapVersion++
    },
    toggleHud() {
      this.hudOn = !this.hudOn
      try {
        localStorage.setItem('logistics-hud', this.hudOn ? '1' : '0')
      } catch { /* 浏览器禁用存储时仍可切换 */ }
    },
    setConnectionState(
      state: 'connecting' | 'connected' | 'reconnecting' | 'error' | 'idle',
      error = '',
    ) {
      this.connectionState = state
      this.connected = state === 'connected'
      this.connectionError = error
    },
  },
})
