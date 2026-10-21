import { defineStore } from 'pinia'
import type { Hub } from '../data/network'
import { HUBS, GUANGDONG_HUB_IDS } from '../data/network'

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
  fromId?: string
  toId?: string
  routeIndex?: number
  position?: [number, number]
}

export interface NameValue {
  id?: string
  fromId?: string
  toId?: string
  name: string
  value: number
}

export interface SnapshotMsg {
  engineId?: string
  events?: AnomalyEvent[]
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
  engineId?: string
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
    engineId: '',
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
    activeEvent: null as AnomalyEvent | null,
    detailSide: 'right' as 'left' | 'right',
    notice: '',
    noticeAt: 0,
    view: 'china' as 'china' | 'guangdong',
    hudOn: false,
    decorationsOn: true,
    tourOn: false,
    tourPaused: false,
    kioskOn: false,
    cursorHidden: false,
    fullscreen: false,
    wakeStatus: '',
    quality: 'full' as 'full' | 'balanced' | 'low',
    qualityReason: '',
    autoQuality: true,
    fps: 0,
    frameMs: 0,
    renderedVehicles: 0,
    renderDpr: 1,
    /** 以 1080 高为基准的整页放大倍数（1 = 真实尺寸） */
    screenScale: 1,
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
      this.syncEngine(msg.engineId)
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
      if (msg.events) this.mergeEvents(msg.events)
      this.mapVersion++
      this.chartVersion++
    },
    applyDelta(msg: DeltaMsg, payloadKB: number) {
      this.syncEngine(msg.engineId)
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
      this.mergeEvents(msg.events)
      this.lastDeltaKB = payloadKB
      this.latencyMs = Math.max(0, Date.now() - msg.ts)
      this.lastDeltaAt = Date.now()
      this.deltaCount++
      this.mapVersion++
      this.chartVersion++
    },
    selectHub(id: string | null) {
      this.activeEvent = null
      this.selectedHubId = id
      if (id && this.view === 'guangdong' && !GUANGDONG_HUB_IDS.has(id)) {
        this.setView('china')
        this.notify('已切换全国视图定位该网点')
      }
    },
    syncEngine(id?: string) {
      if (id && id !== this.engineId) {
        this.events = []
        this.activeEvent = null
        this.selectedHubId = null
        this.engineId = id
      }
    },
    mergeEvents(events: AnomalyEvent[]) {
      const all = new Map([...this.events, ...events].map((event) => [event.id, event]))
      this.events = [...all.values()].sort((a, b) => b.id - a.id).slice(0, 60)
    },
    notify(message: string) { this.notice = message; this.noticeAt = Date.now() },
    locateEvent(event: AnomalyEvent) {
      const names = event.place.split('→').map((name) => name.trim())
      const fromId = event.fromId ?? this.hubs.find((hub) => hub.name === names[0])?.id
      const toId = event.toId ?? this.hubs.find((hub) => hub.name === names[names.length - 1])?.id
      this.activeEvent = { ...event, fromId, toId }
      // 跨省事件保留全国地图，才能同时展示起终点和事件位置。
      this.setView(fromId && toId && GUANGDONG_HUB_IDS.has(fromId) && GUANGDONG_HUB_IDS.has(toId) ? 'guangdong' : 'china')
      this.selectedHubId = toId ?? null
      this.notify(`已定位：${event.place} · ${this.view === 'china' ? '全国' : '广东'}视图`)
    },
    clearSelection() { this.selectedHubId = null; this.activeEvent = null },
    escape() {
      if (this.selectedHubId || this.activeEvent) this.clearSelection()
      else if (this.view === 'guangdong') this.setView('china')
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
