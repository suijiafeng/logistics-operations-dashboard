// 仿真引擎：12000 台车辆沿干线运行
// 状态机：EN_ROUTE（在途） → DWELL（到站装卸） → EN_ROUTE（换线） ；在途随机进入 ANOMALY（异常）
// 内部步进 250ms，聚合 1s 后批量推送 delta；车辆位置用扁平数组编码（[lng, lat, status] * N），不用对象数组，减小包体。

import { HUBS, ROUTES, hubById, pointOnRoute, routeLengthDeg } from './network.js'

export const VEHICLE_COUNT = 12000
const STATUS = { EN_ROUTE: 0, DWELL: 1, ANOMALY: 2 }

const rand = (a, b) => a + Math.random() * (b - a)
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
  vehicles.push({
    routeIdx,
    dir,
    t: Math.random(),
    // 速度：每秒推进的进度（与线路长度成反比，长途慢）；整体为演示加速
    speed: rand(0.004, 0.011) * (2.2 / Math.max(routeLengthDeg(routeIdx), 0.6)),
    status: Math.random() < 0.06 ? STATUS.DWELL : STATUS.EN_ROUTE,
    dwellUntil: 0,
    anomalyUntil: 0,
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

const state = {
  tick: 0,
  ordersToday: 186_400 + Math.floor(rand(0, 4000)),
  onTimeRate: 97.8,
  pendingAnomalies: 0,
  events: [], // 待推送的异常事件
  eventSeq: 0,
  // 24 小时运单趋势：按时段形态生成的基线 + 当前小时实时增长
  trend: Array.from({ length: 24 }, (_, h) => {
    const peak = (h >= 8 && h <= 11) || (h >= 14 && h <= 17) || (h >= 20 && h <= 22)
    const base = peak ? rand(9800, 14200) : h >= 0 && h <= 5 ? rand(900, 2600) : rand(4200, 8600)
    return Math.floor(base)
  }),
  modes: [
    { name: '干线运输', value: 46 },
    { name: '城市配送', value: 27 },
    { name: '快递专线', value: 15 },
    { name: '冷链运输', value: 12 },
  ],
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

function pushEvent(vehicle, hubName) {
  const [type, desc] = pick(EVENT_TEMPLATES)
  const plate = `粤${pick('ABCDEFGHJKLMNPRSTUV')}·${String(Math.floor(rand(10000, 99999)))}`
  state.events.push({
    id: ++state.eventSeq,
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    type,
    vehicle: plate,
    place: hubName,
    desc: `${desc}${type === '延误' ? ` ${Math.floor(rand(20, 140))} 分钟` : ''}`,
    level: type === '车辆故障' ? 2 : type === '偏航' ? 1 : 0,
  })
  if (state.events.length > 60) state.events.splice(0, state.events.length - 60)
}

function vehiclePos(v) {
  const t = v.dir === 1 ? v.t : 1 - v.t
  return pointOnRoute(v.routeIdx, t)
}

export function step(dtMs) {
  const dt = dtMs / 1000
  state.tick++
  let activeAnomalies = 0
  for (const v of vehicles) {
    const now = state.tick
    if (v.status === STATUS.DWELL) {
      if (now >= v.dwellUntil) {
        v.status = STATUS.EN_ROUTE
        v.t = v.dir === 1 ? 0 : 1
      }
      continue
    }
    if (v.status === STATUS.ANOMALY) {
      activeAnomalies++
      if (now >= v.anomalyUntil) {
        v.status = STATUS.EN_ROUTE
        state.pendingAnomalies = Math.max(0, state.pendingAnomalies - 1)
      }
      continue
    }
    // 在途
    v.t += v.speed * dt * v.dir
    // 随机异常：单车每分钟概率约 0.4%（按 tick 时长 0.25s 换算每步概率）
    if (Math.random() < (0.004 / 60) * dt) {
      v.status = STATUS.ANOMALY
      v.anomalyUntil = now + Math.floor(rand(20, 90)) * 4 // tick=250ms → 20–90 秒
      state.pendingAnomalies++
      const [aId, bId] = ROUTES[v.routeIdx]
      pushEvent(v, `${hubById[aId].name} → ${hubById[bId].name}`)
      continue
    }
    if (v.t >= 1 || v.t <= 0) {
      // 到达终点 hub
      const [aId, bId] = ROUTES[v.routeIdx]
      const arrivedHub = v.dir === 1 ? bId : aId
      const hs = hubStats[arrivedHub]
      hs.arrivals++
      // 积压缓慢漂移并钳制在合理区间，避免长时间运行后数值失真
      hs.backlog = Math.min(3000, Math.max(0, hs.backlog + Math.floor(rand(-4, 5))))
      state.ordersToday += Math.floor(rand(1, 4))
      // 换线：新线路从到达 hub 出发，方向随线路定义调整
      const newRoute = nextRouteFrom(arrivedHub, v.routeIdx)
      v.routeIdx = newRoute
      const [na, nb] = ROUTES[newRoute]
      if (na === arrivedHub) {
        v.dir = 1
        v.t = 0
      } else if (nb === arrivedHub) {
        v.dir = -1
        v.t = 1
      }
      v.speed = rand(0.004, 0.011) * (2.2 / Math.max(routeLengthDeg(newRoute), 0.6))
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
    state.onTimeRate = Math.min(99.4, Math.max(95.8, state.onTimeRate + rand(-0.06, 0.06)))
    for (const h of HUBS) {
      const hs = hubStats[h.id]
      hs.utilization = Math.min(98, Math.max(30, hs.utilization + Math.floor(rand(-2, 3))))
      hs.onTime = Math.min(99.9, Math.max(90, hs.onTime + rand(-0.2, 0.2)))
    }
    // 当前小时趋势桶缓慢增长并封顶，避免长时间演示后单桶失真
    const hour = new Date().getHours()
    state.trend[hour] = Math.min(16000, state.trend[hour] + Math.floor(rand(0, 4)))
    for (const m of state.modes) m.value = Math.max(5, m.value + Math.floor(rand(-1, 2)))
    const sum = state.modes.reduce((s, m) => s + m.value, 0)
    state.modes.forEach((m) => (m.value = Math.round((m.value / sum) * 100)))
  }
}

function flatPositions() {
  const arr = new Array(VEHICLE_COUNT * 3)
  for (let i = 0; i < VEHICLE_COUNT; i++) {
    const [lng, lat] = vehiclePos(vehicles[i])
    arr[i * 3] = Math.round(lng * 10000) / 10000
    arr[i * 3 + 1] = Math.round(lat * 10000) / 10000
    arr[i * 3 + 2] = vehicles[i].status
  }
  return arr
}

function routeVolumes() {
  // 运量按幂分布生成，头部干线明显高于尾部，形态更接近真实网络
  return ROUTES.map(([a, b]) => ({
    name: `${hubById[a].name} → ${hubById[b].name}`,
    value: Math.floor(500 + Math.pow(Math.random(), 2.2) * 5400),
  }))
    .sort((x, y) => y.value - x.value)
    .slice(0, 8)
}

let routeVolCache = routeVolumes()
let routeVolAt = Date.now()

export function snapshot() {
  routeVolCache = routeVolumes()
  routeVolAt = Date.now()
  return {
    type: 'snapshot',
    ts: Date.now(),
    vehicleCount: VEHICLE_COUNT,
    vehicles: flatPositions(),
    hubs: HUBS.map((h) => ({ ...h, ...hubStats[h.id] })),
    kpi: kpi(),
    trend: [...state.trend],
    modes: state.modes.map((m) => ({ ...m })),
    punctuality: state.punctuality.map((p) => ({ ...p })),
    routeVolumes: routeVolCache,
  }
}

function kpi() {
  let enRoute = 0
  let anomalies = 0
  for (const v of vehicles) {
    if (v.status === STATUS.EN_ROUTE) enRoute++
    if (v.status === STATUS.ANOMALY) anomalies++
  }
  return {
    enRoute,
    ordersToday: state.ordersToday,
    onTimeRate: Math.round(state.onTimeRate * 10) / 10,
    pendingAnomalies: anomalies,
  }
}

export function delta() {
  if (Date.now() - routeVolAt > 30_000) {
    routeVolCache = routeVolumes()
    routeVolAt = Date.now()
  }
  const events = state.events
  state.events = []
  return {
    type: 'delta',
    ts: Date.now(),
    vehicles: flatPositions(),
    hubs: HUBS.map((h) => ({ id: h.id, ...hubStats[h.id] })),
    kpi: kpi(),
    trend: [...state.trend],
    modes: state.modes.map((m) => ({ ...m })),
    punctuality: state.punctuality.map((p) => ({ ...p })),
    routeVolumes: routeVolCache,
    events,
  }
}
