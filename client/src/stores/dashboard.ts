import { defineStore } from 'pinia'
import type { Hub } from '../data/network'
import { HUBS, ROUTES, hubById } from '../data/network'
import { provinceName } from '../data/provinces'
import { statusOf, routeOf, type VehicleDetail } from '../services/vehicles'
import { postAlertStatus } from '../services/alerts'

export type LayerKey = 'routes' | 'enroute' | 'dwell' | 'anomaly' | 'hubs' | 'alerts'
export const LAYER_KEYS: LayerKey[] = ['routes', 'enroute', 'dwell', 'anomaly', 'hubs', 'alerts']
function loadLayers(): Record<LayerKey, boolean> {
  const layers = { routes: true, enroute: true, dwell: true, anomaly: true, hubs: true, alerts: true }
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
    alertStats: null as AlertStats | null,
    /** 告警面板筛选：待处理（未关闭）/ 全部 */
    alertFilter: 'pending' as 'pending' | 'all',
    /** 正在提交处置的告警 id，防止重复点击 */
    alertBusy: new Set<number>(),
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
      this.routeFleet = countFleet(msg.vehicles)
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
      this.mergeEvents(msg.alertUpdates ? [...msg.events, ...msg.alertUpdates] : msg.events)
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
    /** 选中车辆：清除网点与事件选择；详情由 VehicleDetail 轮询填充 */
    selectVehicle(plate: string | null) {
      if (plate === this.selectedPlate) return
      if (plate) { this.selectedHubId = null; this.activeEvent = null; this.selectedRouteIndex = null }
      this.selectedPlate = plate
      this.vehicle = null
      this.vehicleError = ''
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
        this.activeEvent = null
        this.selectedHubId = null
        this.selectedRouteIndex = null
        this.selectVehicle(null)
        this.engineId = id
      }
    },
    mergeEvents(events: AnomalyEvent[]) {
      // 后到的同 id 对象覆盖先前的（处置更新），再按新到旧截到 60 条
      const all = new Map([...this.events, ...events].map((event) => [event.id, event]))
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
