import { defineStore } from 'pinia'
import type { Hub } from '../data/network'
import { HUBS, ROUTES, hubById } from '../data/network'
import { provinceName } from '../data/provinces'
import { statusOf, routeOf, indexOfPlate, type VehicleDetail } from '../services/vehicles'
import { postAlertStatus } from '../services/alerts'
import type { TrailPoint } from '../services/history'

export type LayerKey = 'routes' | 'enroute' | 'dwell' | 'anomaly' | 'hubs' | 'alerts' | 'cold'
export const LAYER_KEYS: LayerKey[] = ['routes', 'enroute', 'dwell', 'anomaly', 'hubs', 'alerts', 'cold']
function loadLayers(): Record<LayerKey, boolean> {
  const layers = { routes: true, enroute: true, dwell: true, anomaly: true, hubs: true, alerts: true, cold: true }
  try {
    const saved = JSON.parse(localStorage.getItem('logistics-layers') || '{}') as Partial<Record<LayerKey, boolean>>
    for (const key of LAYER_KEYS) if (typeof saved[key] === 'boolean') layers[key] = saved[key]!
  } catch { /* 浏览器禁用存储时用默认值 */ }
  return layers
}

export interface Kpi {
  enRoute: number
  ordersToday: number
  onTimeRate: number
  pendingAnomalies: number
}

export const ALERT_STATUS = ['open', 'acked', 'handling', 'closed'] as const
export type AlertStatus = typeof ALERT_STATUS[number]
export const ALERT_STATUS_TEXT: Record<AlertStatus, string> = { open: '新建', acked: '已确认', handling: '处理中', closed: '已关闭' }

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
  /** 处置字段（引擎 0.3+）：状态机 open → acked → handling → closed，责任网点为目的网点 */
  status?: AlertStatus
  owner?: string
  handler?: string
  createdAt?: number
  updatedAt?: number
  recoveredAt?: number | null
  closedAt?: number | null
  closedBy?: string | null
}

export interface AlertStats {
  open: number
  acked: number
  handling: number
  byLevel: [number, number, number]
  closedToday: number
  closedManual: number
  avgHandleMin: number | null
}
export function isAlertOpen(event: AnomalyEvent) { return event.status !== 'closed' }

export interface ColdOver { index: number; plate: string; driver: string; temp: number; lo: number; hi: number; since: number; alert: boolean }
export interface ColdStats { count: number; overCount: number; over: ColdOver[]; overIndices: number[]; alertsToday: number; avgDeviation: number }
export interface SafetyDriver { index: number; plate: string; driver: string; score: number; speeding: number; braking: number; fatigue: number }
export interface SafetyEvent { id: number; ts: number; type: string; label: string; plate: string; driver: string; routeIndex: number; speed: number; score: number }
export interface SafetyStats { today: { speeding: number; braking: number; fatigue: number }; avgScore: number; flagged: number; worst: SafetyDriver[]; recent: SafetyEvent[] }

/** 运单实体聚合：五段漏斗累计、各段在制、签收与时效、省际 OD（adcode） */
export interface ShipmentStats {
  stages: string[]
  funnel: number[]
  inStage: number[]
  signedToday: number
  live: number
  avgDelayMin: number
  punctuality: NameValue[]
  od: { from: string; to: string; value: number }[]
  /** 省内流向合计（不进桑基图） */
  odIntra: number
  odTotal: number
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
  trendYesterday?: number[]
  modes: NameValue[]
  punctuality: NameValue[]
  routeVolumes: NameValue[]
  routeOrders?: number[]
  alertStats?: AlertStats
  shipments?: ShipmentStats
  cold?: ColdStats
  safety?: SafetyStats
  /** 引擎事件游标：订阅时带回，补收快照之后广播掉的事件 */
  eventSeq?: number
}

/** 订阅补收：快照（或被跳过的增量）之后到订阅之间的新事件与告警状态变更 */
export interface CatchupMsg {
  engineId?: string
  type: 'catchup'
  ts: number
  events: AnomalyEvent[]
  alertUpdates: AnomalyEvent[]
  /** 游标之前还有已被引擎淘汰的事件，历史不完整 */
  truncated: boolean
}

export interface DeltaMsg {
  engineId?: string
  type: 'delta'
  ts: number
  vehicles: number[]
  hubs: { id: string }[]
  kpi: Kpi
  trend: (number | null)[]
  trendYesterday?: number[]
  modes: NameValue[]
  punctuality: NameValue[]
  routeVolumes: NameValue[]
  routeOrders?: number[]
  events: AnomalyEvent[]
  alertUpdates?: AnomalyEvent[]
  alertStats?: AlertStats
  shipments?: ShipmentStats
  cold?: ColdStats
  safety?: SafetyStats
}

function countFleet(flat: number[]): [number, number, number][] {
  const fleet = ROUTES.map(() => [0, 0, 0] as [number, number, number])
  for (let i = 2; i < flat.length; i += 3) {
    const code = flat[i]!
    const route = fleet[routeOf(code)], status = statusOf(code)
    if (route && status >= 0 && status <= 2) route[status as 0 | 1 | 2]++
  }
  return fleet
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
    // 昨日各小时运单（引擎按同一确定性规则生成，用作分时图的同期参考）
    trendYesterday: [] as number[],
    modes: [] as NameValue[],
    punctuality: [] as NameValue[],
    routeVolumes: [] as NameValue[],
    /** 全部干线今日单量，ROUTES 顺序 */
    routeOrders: [] as number[],
    /** 每条干线当前车辆数 [在途, 装卸, 异常]，由扁平数组解码统计 */
    routeFleet: [] as [number, number, number][],
    events: [] as AnomalyEvent[],
    /** 已收到的最大事件 id 与最后一包的服务端时间：订阅时带给引擎补收空窗事件 */
    eventCursor: 0,
    alertCursor: 0,
    alertStats: null as AlertStats | null,
    shipments: null as ShipmentStats | null,
    cold: null as ColdStats | null,
    safety: null as SafetyStats | null,
    /** 告警面板筛选：待处理（未关闭）/ 全部 */
    alertFilter: 'pending' as 'pending' | 'all',
    /** 正在提交处置的告警 id，防止重复点击 */
    alertBusy: new Set<number>(),
    /** 历史回放：on 时地图改画 frame（与实时同构的扁平数组），实时数据继续在后台更新 */
    playback: {
      on: false,
      frames: [] as number[],
      interval: 10_000,
      index: 0,
      playing: false,
      fps: 3,
      frame: null as number[] | null,
      frameTs: 0,
      frameKpi: null as { enRoute: number; pendingAnomalies: number } | null,
      loading: false,
      error: '',
    },
    /** 选中车辆的尾迹：服务端最近 1 小时各帧位置 + 选中后按 1Hz 增量追加 */
    trail: null as { plate: string; points: TrailPoint[] } | null,
    selectedHubId: null as string | null,
    activeEvent: null as AnomalyEvent | null,
    /** 选中追踪的车牌；详情由 /vehicles/:plate 轮询，位置在增量包里按下标读取 */
    /** 选中的干线下标：地图高亮该线并只突出线上车辆 */
    selectedRouteIndex: null as number | null,
    selectedPlate: null as string | null,
    vehicle: null as VehicleDetail | null,
    vehicleError: '',
    /** 地图图层开关（持久化到 localStorage） */
    layers: loadLayers(),
    detailSide: 'right' as 'left' | 'right',
    notice: '',
    noticeAt: 0,
    /** 'china' 或省级 adcode（如 '440000'） */
    view: 'china' as string,
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
    /** 当前视图名称：全国 / 省名 */
    viewName(state): string { return state.view === 'china' ? '全国' : provinceName(state.view) },
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
      this.routeFleet = countFleet(msg.vehicles)
      this.hubs = msg.hubs
      this.kpi = msg.kpi
      this.trend = msg.trend
      if (msg.trendYesterday) this.trendYesterday = msg.trendYesterday
      this.modes = msg.modes
      this.punctuality = msg.punctuality
      this.routeVolumes = msg.routeVolumes
      if (msg.routeOrders) this.routeOrders = msg.routeOrders
      if (msg.alertStats) this.alertStats = msg.alertStats
      if (msg.shipments) this.shipments = msg.shipments
      if (msg.cold) this.cold = msg.cold
      if (msg.safety) this.safety = msg.safety
      if (msg.events) this.mergeEvents(msg.events)
      if (typeof msg.eventSeq === 'number') this.eventCursor = Math.max(this.eventCursor, msg.eventSeq)
      this.alertCursor = msg.ts
      this.mapVersion++
      this.chartVersion++
    },
    applyCatchup(msg: CatchupMsg) {
      this.syncEngine(msg.engineId)
      this.mergeEvents([...msg.events, ...msg.alertUpdates])
      this.alertCursor = Math.max(this.alertCursor, msg.ts)
      if (msg.truncated) this.notify('重连期间的事件超过引擎保留窗口，告警历史可能不完整')
    },
    applyDelta(msg: DeltaMsg, payloadKB: number) {
      this.syncEngine(msg.engineId)
      this.receivedAt = this.checkedAt = Date.now()
      this.connectionError = ''
      this.dataAt = msg.ts
      this.vehicles = msg.vehicles
      this.routeFleet = countFleet(msg.vehicles)
      this.appendTrail(msg.ts, msg.vehicles)
      // 网点统计按 id 合并，不整表替换（保留对象引用稳定）
      const byId = new Map(this.hubs.map((h) => [h.id, h]))
      for (const hs of msg.hubs) {
        const hub = byId.get(hs.id)
        if (hub) Object.assign(hub, hs)
      }
      this.kpi = msg.kpi
      this.trend = msg.trend
      if (msg.trendYesterday) this.trendYesterday = msg.trendYesterday
      this.modes = msg.modes
      this.punctuality = msg.punctuality
      this.routeVolumes = msg.routeVolumes
      if (msg.routeOrders) this.routeOrders = msg.routeOrders
      if (msg.alertStats) this.alertStats = msg.alertStats
      if (msg.shipments) this.shipments = msg.shipments
      if (msg.cold) this.cold = msg.cold
      if (msg.safety) this.safety = msg.safety
      this.mergeEvents(msg.alertUpdates ? [...msg.events, ...msg.alertUpdates] : msg.events)
      this.alertCursor = msg.ts
      this.lastDeltaKB = payloadKB
      this.latencyMs = Math.max(0, Date.now() - msg.ts)
      this.lastDeltaAt = Date.now()
      this.deltaCount++
      this.mapVersion++
      this.chartVersion++
    },
    selectHub(id: string | null) {
      this.activeEvent = null
      this.selectVehicle(null)
      if (id) this.selectedRouteIndex = null
      this.selectedHubId = id
      if (id && this.view !== 'china' && hubById[id]?.province !== this.view) {
        this.setView('china')
        this.notify('已切换全国视图定位该网点')
      }
    },
    /** 选中车辆：清除网点与事件选择；详情由 VehicleDetail 轮询填充，尾迹由其拉取 */
    selectVehicle(plate: string | null) {
      if (plate === this.selectedPlate) return
      if (plate) { this.selectedHubId = null; this.activeEvent = null; this.selectedRouteIndex = null }
      this.selectedPlate = plate
      this.vehicle = null
      this.vehicleError = ''
      this.trail = null
      this.mapVersion++
    },
    /** 增量到达时给选中车辆的尾迹追加一个 1Hz 点（最多保留 1 小时） */
    appendTrail(ts: number, flat: number[]) {
      const trail = this.trail
      if (!trail || trail.plate !== this.selectedPlate) return
      const index = indexOfPlate(trail.plate, this.vehicleCount)
      if (index < 0 || flat.length < (index + 1) * 3) return
      const code = flat[index * 3 + 2]!
      trail.points.push([ts, flat[index * 3]!, flat[index * 3 + 1]!, statusOf(code)])
      const cutoff = ts - 3_600_000
      while (trail.points.length && trail.points[0]![0] < cutoff) trail.points.shift()
      if (trail.points.length > 4000) trail.points.splice(0, trail.points.length - 4000)
    },
    setPlayback(on: boolean) {
      this.playback.on = on
      this.playback.playing = false
      this.playback.loading = false
      this.playback.error = ''
      if (!on) { this.playback.frame = null; this.playback.frameTs = 0; this.playback.frameKpi = null }
      this.mapVersion++
    },
    applyPlaybackFrame(ts: number, vehicles: number[], kpi: { enRoute: number; pendingAnomalies: number }) {
      this.playback.frame = vehicles
      this.playback.frameTs = ts
      this.playback.frameKpi = kpi
      this.mapVersion++
    },
    /** 选中干线：清除网点 / 车辆 / 事件选择；线路不在当前省内时回到全国 */
    selectRoute(index: number | null) {
      if (index !== null && (!Number.isInteger(index) || index < 0 || index >= ROUTES.length)) return
      if (index !== null) { this.selectedHubId = null; this.activeEvent = null; this.selectVehicle(null) }
      this.selectedRouteIndex = index
      if (index !== null && this.view !== 'china') {
        const [a, b] = ROUTES[index]!
        const pa = hubById[a]?.province, pb = hubById[b]?.province
        if (pa !== this.view && pb !== this.view) { this.setView('china'); this.notify('已切换全国视图展示该干线') }
      }
      this.mapVersion++
    },
    setLayer(key: LayerKey, on: boolean) {
      this.layers[key] = on
      try { localStorage.setItem('logistics-layers', JSON.stringify(this.layers)) } catch { /* 忽略存储失败 */ }
      this.mapVersion++
    },
    syncEngine(id?: string) {
      if (id && id !== this.engineId) {
        this.events = []
        this.eventCursor = 0
        this.alertCursor = 0
        this.activeEvent = null
        this.selectedHubId = null
        this.selectedRouteIndex = null
        this.selectVehicle(null)
        this.engineId = id
      }
    },
    mergeEvents(events: AnomalyEvent[]) {
      // 同 id 以 updatedAt 新的为准（补收包与增量包可能乱序到达），再按新到旧截到 60 条
      const all = new Map(this.events.map((event) => [event.id, event]))
      for (const event of events) {
        const known = all.get(event.id)
        if (!known || (event.updatedAt ?? 0) >= (known.updatedAt ?? 0)) all.set(event.id, event)
        if (event.id > this.eventCursor) this.eventCursor = event.id
      }
      this.events = [...all.values()].sort((a, b) => b.id - a.id).slice(0, 60)
      if (this.activeEvent) {
        const latest = all.get(this.activeEvent.id)
        if (latest && latest !== this.activeEvent) this.activeEvent = { ...this.activeEvent, ...latest }
      }
    },
    /** 告警处置：调引擎接口，成功后立即合并返回的告警，其他大屏由下一包 delta 同步 */
    async setAlertStatus(id: number, status: AlertStatus) {
      if (this.alertBusy.has(id)) return
      this.alertBusy = new Set(this.alertBusy).add(id)
      try {
        const alert = await postAlertStatus(id, status)
        this.mergeEvents([alert])
        this.notify(`${alert.type} · ${alert.vehicle}：${ALERT_STATUS_TEXT[alert.status ?? 'open']}`)
      } catch (error) {
        this.notify(`处置失败：${(error as Error).message}`)
      } finally {
        const next = new Set(this.alertBusy); next.delete(id); this.alertBusy = next
      }
    },
    notify(message: string) { this.notice = message; this.noticeAt = Date.now() },
    locateEvent(event: AnomalyEvent) {
      const names = event.place.split('→').map((name) => name.trim())
      const fromId = event.fromId ?? this.hubs.find((hub) => hub.name === names[0])?.id
      const toId = event.toId ?? this.hubs.find((hub) => hub.name === names[names.length - 1])?.id
      this.selectVehicle(null)
      this.selectedRouteIndex = null
      this.activeEvent = { ...event, fromId, toId }
      // 同省事件下钻到该省；跨省事件保留全国地图，才能同时展示起终点和事件位置。
      const from = fromId ? hubById[fromId]?.province : undefined
      const to = toId ? hubById[toId]?.province : undefined
      this.setView(from && from === to ? from : 'china')
      this.selectedHubId = toId ?? null
      this.notify(`已定位：${event.place} · ${this.viewName}视图`)
    },
    clearSelection() { this.selectedHubId = null; this.activeEvent = null; this.selectedRouteIndex = null; this.selectVehicle(null) },
    escape() {
      if (this.selectedHubId || this.activeEvent || this.selectedPlate || this.selectedRouteIndex !== null) this.clearSelection()
      else if (this.view !== 'china') this.setView('china')
    },
    setView(v: string) {
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
