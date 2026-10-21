// 仿真引擎：12000 台车辆沿干线真实道路折线运行（几何见 routes.js，由 OSRM 离线生成）
// 状态机：EN_ROUTE（在途） → DWELL（到站装卸） → EN_ROUTE（换线） ；在途随机进入 ANOMALY（异常）
// 车辆以公里为位置、km/h 为速度，仿真时钟按 TIME_SCALE 加速（1 真实秒 = 60 仿真秒），长途线路也能在几分钟内看到车辆走完。
// 内部步进 250ms，聚合 1s 后批量推送 delta；车辆位置用扁平数组编码（[lng, lat, code] * N），不用对象数组，减小包体；
// code = status × 100 + 线路下标，客户端据此按线路筛选车辆（线路不超过 100 条）。

import { HUBS, ROUTES, hubById } from './network.js'
import { routeKm, pointAtKm, headingAtKm } from './routes.js'
import { readMetrics, readModes, readHubHistory, readYesterdayTrend } from './metrics.js'

export const VEHICLE_COUNT = 12000
/** 扁平数组第三位：状态 × ROUTE_CODE + 线路下标 */
export const ROUTE_CODE = 100
const STATUS = { EN_ROUTE: 0, DWELL: 1, ANOMALY: 2 }
if (ROUTES.length > ROUTE_CODE) throw new Error(`线路数 ${ROUTES.length} 超过编码上限 ${ROUTE_CODE}`)

/** 仿真加速倍数：1 真实秒推进 60 仿真秒 */
export const TIME_SCALE = 60
const rand = (a, b) => a + Math.random() * (b - a)
/** 干线货车巡航速度（km/h，仿真时钟口径） */
const randSpeed = () => Math.round(rand(70, 95))
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// 线路按权重抽车辆
const routeBag = []
ROUTES.forEach((r, i) => {
  for (let k = 0; k < r[2]; k++) routeBag.push(i)
})
// 每个 hub 的出线索引（到站换线用）
const routesFrom = {}
ROUTES.forEach((r, i) => {
  ;(routesFrom[r[0]] ??= []).push(i)
  ;(routesFrom[r[1]] ??= []).push(i)
})

function nextRouteFrom(hubId, preferIdx) {
  const list = routesFrom[hubId]
  if (!list || list.length === 0) return preferIdx
  // 60% 概率沿当前线路反向，其余随机选一条从该 hub 出发的线路
  if (Math.random() < 0.6) return preferIdx
  return pick(list)
}

const vehicles = []
for (let i = 0; i < VEHICLE_COUNT; i++) {
  const routeIdx = pick(routeBag)
  const dir = Math.random() < 0.5 ? 1 : -1
  const dwelling = Math.random() < 0.06
  const total = routeKm(routeIdx)
  vehicles.push({
    plate: `粤A·${String(10000 + i)}`,
    routeIdx,
    dir,
    // km：沿干线从起点算起的里程（几何口径）；dir 只决定 km 增减方向
    km: dwelling ? (dir === 1 ? 0 : total) : Math.random() * total,
    speedKmh: randSpeed(),
    status: dwelling ? STATUS.DWELL : STATUS.EN_ROUTE,
    dwellUntil: dwelling ? Math.floor(rand(4, 20)) * 4 : 0,
    anomalyUntil: 0,
    alertId: 0,
  })
}

const hubStats = {}
for (const h of HUBS) {
  // 初始吞吐按网点等级给基线：一级枢纽 > 二级 > 三级
  const base = h.level === 1 ? rand(3200, 5800) : h.level === 2 ? rand(1400, 3200) : rand(500, 1400)
  hubStats[h.id] = {
    arrivals: Math.floor(base * rand(0.92, 1.05)),
    departures: Math.floor(base * rand(0.92, 1.05)),
    backlog: Math.floor(rand(20, 900)),
    utilization: Math.round(rand(45, 92)),
    onTime: Math.round(rand(93, 99) * 10) / 10,
  }
}

const engineId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
let metrics = readMetrics()
// 告警生命周期：open（新建）→ acked（已确认）→ handling（处理中）→ closed（已关闭）；
// 任何未关闭状态都可直接关闭。提醒级（level 0）在车辆恢复后由系统自动关闭，其余在恢复 10 分钟后仍无人处置也由系统关闭。
export const ALERT_STATUS = ['open', 'acked', 'handling', 'closed']
const AUTO_CLOSE_MS = 10 * 60_000
const ALERT_RETAIN_MS = 60 * 60_000
const state = {
  tick: 0,
  onTimeRate: 97.8,
  pendingAnomalies: 0,
  events: [], // 待推送的异常事件
  history: [],
  eventSeq: 0,
  /** 全部未过期告警：id → 事件对象（与 history 中同一引用） */
  alerts: new Map(),
  /** 本轮状态有变化的告警，随 delta 推送后清空 */
  alertChanges: new Map(),
  closedToday: [],
  punctuality: [
    { name: '准时送达', value: 82 },
    { name: '延误 <2h', value: 11 },
    { name: '延误 2–6h', value: 5 },
    { name: '延误 >6h', value: 2 },
  ],
}

const EVENT_TEMPLATES = [
  ['延误', '受前方路段缓行影响，预计延误'],
  ['偏航', '偏离规划干线，正在重新规划路线'],
  ['车辆故障', '车辆上报故障码，就近网点待检修'],
  ['天气影响', '途经区域强降雨，车速受限'],
  ['网点积压', '目的网点分拣积压，到站后需排队卸货'],
]

function pushEvent(vehicle) {
  const [aId, bId] = ROUTES[vehicle.routeIdx]
  const [from, to] = vehicle.dir === 1 ? [aId, bId] : [bId, aId]
  const [type, desc] = pick(EVENT_TEMPLATES)
  const event = {
    id: ++state.eventSeq,
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }),
    type,
    vehicle: vehicle.plate,
    fromId: from,
    toId: to,
    routeIndex: vehicle.routeIdx,
    position: vehiclePos(vehicle),
    place: `${hubById[from].name} → ${hubById[to].name}`,
    desc: `${desc}${type === '延误' ? ` ${Math.floor(rand(20, 140))} 分钟` : ''}`,
    level: type === '车辆故障' ? 2 : type === '偏航' ? 1 : 0,
    // 处置字段：责任网点为目的网点（到站后由其接手），状态机见 ALERT_STATUS
    status: 'open',
    owner: to,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    recoveredAt: null,
    closedAt: null,
    closedBy: null,
  }
  vehicle.alertId = event.id
  state.alerts.set(event.id, event)
  state.events.push(event)
  state.history = [event, ...state.history].slice(0, 60)
  if (state.events.length > 60) state.events.splice(0, state.events.length - 60)
}

function closeAlert(alert, by, now = Date.now()) {
  alert.status = 'closed'
  alert.closedAt = now
  alert.closedBy = by
  alert.updatedAt = now
  state.closedToday.push(alert)
  state.alertChanges.set(alert.id, alert)
}

/** 处置告警：返回更新后的告警；非法 id 或非法流转返回 { error } */
export function updateAlert(id, status, by = '大屏值班') {
  const alert = state.alerts.get(Number(id))
  if (!alert) return { error: 'alert_not_found' }
  if (!ALERT_STATUS.includes(status)) return { error: 'invalid_status' }
  if (alert.status === 'closed') return { error: 'already_closed' }
  const from = ALERT_STATUS.indexOf(alert.status), to = ALERT_STATUS.indexOf(status)
  // 只允许向前流转：下一步或直接关闭
  if (!(to === from + 1 || status === 'closed')) return { error: 'invalid_transition' }
  const now = Date.now()
  if (status === 'closed') closeAlert(alert, by, now)
  else { alert.status = status; alert.updatedAt = now; alert.handler = by; state.alertChanges.set(alert.id, alert) }
  return { alert }
}

/** 车辆恢复后的告警收口：提醒级自动关闭，其余记录恢复时间等待人工处置 */
function recoverAlert(vehicle, now) {
  const alert = state.alerts.get(vehicle.alertId)
  vehicle.alertId = 0
  if (!alert || alert.status === 'closed') return
  alert.recoveredAt = now
  alert.updatedAt = now
  if (alert.level === 0) closeAlert(alert, '系统 · 车辆已恢复', now)
  else state.alertChanges.set(alert.id, alert)
}

function sweepAlerts(now) {
  for (const alert of state.alerts.values()) {
    if (alert.status !== 'closed' && alert.recoveredAt && now - alert.recoveredAt > AUTO_CLOSE_MS) closeAlert(alert, '系统 · 恢复后超时未处置', now)
    if (alert.status === 'closed' && now - alert.closedAt > ALERT_RETAIN_MS) state.alerts.delete(alert.id)
  }
}

/** 告警统计：按状态、级别计数，今日关闭数与人工处置平均时长（分钟） */
export function alertStats() {
  const byStatus = { open: 0, acked: 0, handling: 0 }
  const byLevel = [0, 0, 0]
  for (const alert of state.alerts.values()) {
    if (alert.status === 'closed') continue
    byStatus[alert.status]++
    byLevel[alert.level]++
  }
  const manual = state.closedToday.filter((a) => !String(a.closedBy).startsWith('系统'))
  const avgHandleMin = manual.length
    ? Math.round(manual.reduce((sum, a) => sum + (a.closedAt - a.createdAt), 0) / manual.length / 60_000 * 10) / 10
    : null
  return { ...byStatus, byLevel, closedToday: state.closedToday.length, closedManual: manual.length, avgHandleMin }
}

function vehiclePos(v) {
  // km 始终是从线路起点算起的里程；反向车辆不做 total-km 翻转，否则画面位置与到站网点相反并在换线时跳点。
  return pointAtKm(v.routeIdx, v.km)
}

/** 车辆实时详情（按需查询，不进 1Hz 增量包） */
export function vehicleDetail(plate) {
  const v = vehicles.find((item) => item.plate === plate)
  if (!v) return null
  const [aId, bId] = ROUTES[v.routeIdx]
  const [fromId, toId] = v.dir === 1 ? [aId, bId] : [bId, aId]
  const total = routeKm(v.routeIdx)
  const remainingKm = v.dir === 1 ? total - v.km : v.km
  return {
    plate: v.plate, status: v.status, fromId, toId, routeIndex: v.routeIdx,
    position: vehiclePos(v), heading: Math.round(headingAtKm(v.routeIdx, v.km, v.dir)),
    speedKmh: v.status === STATUS.EN_ROUTE ? v.speedKmh : 0,
    routeKm: Math.round(total), traveledKm: Math.round(total - remainingKm), remainingKm: Math.round(remainingKm),
    etaMin: v.status === STATUS.EN_ROUTE ? Math.round(remainingKm / v.speedKmh * 60) : null,
  }
}

export function step(dtMs) {
  const nextMetrics = readMetrics()
  if (nextMetrics.day !== metrics.day) {
    for (const hub of Object.values(hubStats)) { hub.arrivals = 0; hub.departures = 0 }
    state.events = []
    state.history = []
    state.alerts.clear()
    state.alertChanges.clear()
    state.closedToday = []
  }
  metrics = nextMetrics
  const dt = dtMs / 1000
  state.tick++
  let activeAnomalies = 0
  for (const v of vehicles) {
    const now = state.tick
    if (v.status === STATUS.DWELL) {
      if (now >= v.dwellUntil) {
        v.status = STATUS.EN_ROUTE
        v.km = v.dir === 1 ? 0 : routeKm(v.routeIdx)
      }
      continue
    }
    if (v.status === STATUS.ANOMALY) {
      activeAnomalies++
      if (now >= v.anomalyUntil) {
        v.status = STATUS.EN_ROUTE
        state.pendingAnomalies = Math.max(0, state.pendingAnomalies - 1)
        recoverAlert(v, Date.now())
      }
      continue
    }
    // 在途：按 km/h 乘以加速后的仿真时长推进里程
    v.km += v.speedKmh * (dt * TIME_SCALE / 3600) * v.dir
    // 随机异常：单车每分钟概率约 0.4%（按 tick 时长 0.25s 换算每步概率）
    if (Math.random() < (0.004 / 60) * dt) {
      v.status = STATUS.ANOMALY
      v.anomalyUntil = now + Math.floor(rand(20, 90)) * 4 // tick=250ms → 20–90 秒
      state.pendingAnomalies++
      pushEvent(v)
      continue
    }
    if (v.km >= routeKm(v.routeIdx) || v.km <= 0) {
      // 到达终点 hub
      const [aId, bId] = ROUTES[v.routeIdx]
      const arrivedHub = v.dir === 1 ? bId : aId
      const hs = hubStats[arrivedHub]
      hs.arrivals++
      // 积压缓慢漂移并钳制在合理区间，避免长时间运行后数值失真
      hs.backlog = Math.min(3000, Math.max(0, hs.backlog + Math.floor(rand(-4, 5))))
      // 换线：新线路从到达 hub 出发，方向随线路定义调整
      const newRoute = nextRouteFrom(arrivedHub, v.routeIdx)
      v.routeIdx = newRoute
      const [na, nb] = ROUTES[newRoute]
      if (na === arrivedHub) {
        v.dir = 1
        v.km = 0
      } else if (nb === arrivedHub) {
        v.dir = -1
        v.km = routeKm(newRoute)
      }
      v.speedKmh = randSpeed()
      // 每台到车最终都会换线发出，发车计数与到车保持大体平衡
      hubStats[arrivedHub].departures++
      // 30% 概率在站内装卸停留 4–20 秒
      if (Math.random() < 0.3) {
        v.status = STATUS.DWELL
        v.dwellUntil = now + Math.floor(rand(4, 20)) * 4
      }
    }
  }
  state.pendingAnomalies = Math.max(state.pendingAnomalies, activeAnomalies)
  // 准时率与仓配利用率缓慢游走
  if (state.tick % 4 === 0) {
    sweepAlerts(Date.now())
    state.onTimeRate = Math.min(99.4, Math.max(95.8, state.onTimeRate + rand(-0.06, 0.06)))
    for (const h of HUBS) {
      const hs = hubStats[h.id]
      hs.utilization = Math.min(98, Math.max(30, hs.utilization + Math.floor(rand(-2, 3))))
      hs.onTime = Math.min(99.9, Math.max(90, hs.onTime + rand(-0.2, 0.2)))
    }
  }
}

// 历史帧：每 HISTORY_INTERVAL 存一帧全部车辆位置（Int32：经纬度 × 1e5、状态码），环形保留 1 小时。
// 每帧 12000 × 3 × 4 = 144 KB，360 帧约 52 MB（TypedArray 不占 V8 堆）；回放按帧取，尾迹按车辆下标跨帧取。
export const HISTORY_INTERVAL = 10_000
export const HISTORY_FRAMES = 360
const history = []
const SCALE = 1e5

export function recordHistoryFrame(ts = Date.now()) {
  const data = new Int32Array(VEHICLE_COUNT * 3)
  for (let i = 0; i < VEHICLE_COUNT; i++) {
    const [lng, lat] = vehiclePos(vehicles[i])
    data[i * 3] = Math.round(lng * SCALE)
    data[i * 3 + 1] = Math.round(lat * SCALE)
    data[i * 3 + 2] = vehicles[i].status * ROUTE_CODE + vehicles[i].routeIdx
  }
  const k = kpi()
  history.push({ ts, data, kpi: { enRoute: k.enRoute, pendingAnomalies: k.pendingAnomalies } })
  if (history.length > HISTORY_FRAMES) history.shift()
  return history.length
}

/** 可回放的帧时间戳列表（旧到新） */
export function historyIndex() {
  return { interval: HISTORY_INTERVAL, frames: history.map((f) => f.ts) }
}

/** 取某一帧：ts 取最接近的一帧（相差不超过一个间隔），返回与实时同构的扁平数组 */
export function historyFrame(ts) {
  if (!history.length) return null
  let best = history[0]
  for (const frame of history) if (Math.abs(frame.ts - ts) < Math.abs(best.ts - ts)) best = frame
  if (Math.abs(best.ts - ts) > HISTORY_INTERVAL) return null
  const vehiclesOut = new Array(best.data.length)
  for (let i = 0; i < best.data.length; i += 3) {
    vehiclesOut[i] = best.data[i] / SCALE
    vehiclesOut[i + 1] = best.data[i + 1] / SCALE
    vehiclesOut[i + 2] = best.data[i + 2]
  }
  return { ts: best.ts, vehicleCount: VEHICLE_COUNT, vehicles: vehiclesOut, kpi: best.kpi }
}

/** 单车尾迹：最近 sinceMs 内各历史帧里该车的位置 [ts, lng, lat, status]，旧到新 */
export function vehicleTrail(plate, sinceMs = 3_600_000) {
  const index = vehicles.findIndex((v) => v.plate === plate)
  if (index < 0) return null
  const from = Date.now() - sinceMs
  const points = []
  for (const frame of history) {
    if (frame.ts < from) continue
    points.push([frame.ts, frame.data[index * 3] / SCALE, frame.data[index * 3 + 1] / SCALE, Math.floor(frame.data[index * 3 + 2] / ROUTE_CODE)])
  }
  return { plate, interval: HISTORY_INTERVAL, points }
}

function flatPositions() {
  const arr = new Array(VEHICLE_COUNT * 3)
  for (let i = 0; i < VEHICLE_COUNT; i++) {
    const [lng, lat] = vehiclePos(vehicles[i])
    // 保留 5 位小数（约 1 米）：车辆沿真实道路行驶，城市级视图下 3 位小数会让车辆离开路面
    arr[i * 3] = Math.round(lng * 1e5) / 1e5
    arr[i * 3 + 1] = Math.round(lat * 1e5) / 1e5
    arr[i * 3 + 2] = vehicles[i].status * ROUTE_CODE + vehicles[i].routeIdx
  }
  return arr
}

function routeVolumes() {
  return ROUTES.map(([a, b], index) => ({
    id: `${a}-${b}`, fromId: a, toId: b,
    name: `${hubById[a].name} → ${hubById[b].name}`,
    value: metrics.routes[index],
  }))
    .sort((x, y) => y.value - x.value || x.id.localeCompare(y.id))
    .slice(0, 8)
}

// 每个网点的进出线路今日单量（对端网点 id → 单量），与线路排行同一份累计
function routeOrdersFor(hubId) {
  const result = {}
  ROUTES.forEach(([a, b], index) => { if (a === hubId) result[b] = metrics.routes[index]; else if (b === hubId) result[a] = metrics.routes[index] })
  return result
}

function serialHubs(full) {
  const history = readHubHistory()
  return HUBS.map((h) => ({ ...(full ? h : { id: h.id }), ...hubStats[h.id], ...history[h.id], routeOrders: routeOrdersFor(h.id) }))
}

export function snapshot() {
  return {
    type: 'snapshot',
    engineId,
    ts: Date.now(),
    vehicleCount: VEHICLE_COUNT,
    vehicles: flatPositions(),
    hubs: serialHubs(true),
    kpi: kpi(),
    trend: [...metrics.trend],
    trendYesterday: readYesterdayTrend(),
    modes: readModes(),
    punctuality: state.punctuality.map((p) => ({ ...p })),
    routeVolumes: routeVolumes(),
    // 全部干线今日单量（ROUTES 顺序），供地图按单量分级与线路详情使用；排行仍只取前 8
    routeOrders: [...metrics.routes],
    events: state.history.slice(0, 60),
    alertStats: alertStats(),
  }
}

function kpi() {
  let enRoute = 0
  for (const v of vehicles) if (v.status === STATUS.EN_ROUTE) enRoute++
  // 待处理异常 = 未关闭的告警数（与同行控制塔口径一致），不再是当前异常车辆数
  let pending = 0
  for (const alert of state.alerts.values()) if (alert.status !== 'closed') pending++
  return {
    enRoute,
    ordersToday: metrics.ordersToday,
    onTimeRate: Math.round(state.onTimeRate * 10) / 10,
    pendingAnomalies: pending,
  }
}

export function delta() {
  const events = state.events
  state.events = []
  // 本轮状态变化的告警（排除刚新建、已在 events 里的）
  const fresh = new Set(events.map((e) => e.id))
  const alertUpdates = [...state.alertChanges.values()].filter((a) => !fresh.has(a.id))
  state.alertChanges.clear()
  return {
    type: 'delta',
    engineId,
    ts: Date.now(),
    vehicles: flatPositions(),
    hubs: serialHubs(false),
    kpi: kpi(),
    trend: [...metrics.trend],
    trendYesterday: readYesterdayTrend(),
    modes: readModes(),
    punctuality: state.punctuality.map((p) => ({ ...p })),
    routeVolumes: routeVolumes(),
    routeOrders: [...metrics.routes],
    events,
    alertUpdates,
    alertStats: alertStats(),
  }
}
