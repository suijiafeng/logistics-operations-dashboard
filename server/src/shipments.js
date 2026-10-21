// 运单实体与五段状态机：揽收 → 分拣 → 干线 → 派送 → 签收。
// 实体数量与 metrics.js 的确定性运单累计严格一致：每个仿真步按各干线累计单量的增量创建实体，
// 每个实体随机取方向（起点 → 终点），各段时长按 60× 仿真加速（真实 2 小时 ≈ 2 分钟）；签收后只留计数，实体释放。
// 启动时当日已累计的运单没有实体，只按经验比例初始化漏斗与在制数，之后全部由实体推进；OD 流向只统计实体。
import { ROUTES, hubById } from './network.js'
import { routeKm } from './routes.js'
import { readMetrics } from './metrics.js'

export const STAGES = ['揽收', '分拣', '干线', '派送', '签收']
const MINUTE = 60_000
const rand = (a, b) => a + Math.random() * (b - a)
// 各段时长（分钟，仿真口径）：干线段按里程 / 85 km/h，60× 加速后小时数即分钟数
const PICKUP = [3, 8], SORT = [4, 10], DELIVER = [5, 12]
const LINEHAUL_KMH = 85
// 时效承诺 = 各段期望之和 × 1.15；延误分档按仿真分钟（≈ 真实小时 / 60）：≤0 准时、≤2 分钟（2 小时）、≤6 分钟、更长
const PUNCTUAL_NAMES = ['准时送达', '延误 <2h', '延误 2–6h', '延误 >6h']
const PUNCTUAL_PRIOR = [82, 11, 5, 2]
// 启动回填比例：当日已累计单量中各阶段已到达的占比（仅初始化计数，不生成实体）
const BACKFILL = [1, 0.96, 0.9, 0.83, 0.78]
const MAX_LIVE = 80_000

let seq = 0
let day = null
let lastRoutes = null
let live = []
const funnel = [0, 0, 0, 0, 0]
const inStage = [0, 0, 0, 0, 0]
const od = new Map()
const punctual = [0, 0, 0, 0]
let signedToday = 0
let delayMinSum = 0

function provinceOf(hubId) { return hubById[hubId].province }

function reset(metrics) {
  live = []
  od.clear()
  punctual.fill(0)
  signedToday = 0
  delayMinSum = 0
  const total = metrics.ordersToday
  for (let s = 0; s < 5; s++) funnel[s] = Math.round(total * BACKFILL[s])
  for (let s = 0; s < 4; s++) inStage[s] = funnel[s] - funnel[s + 1]
  inStage[4] = 0
  // 回填的已签收数计入今日签收，保证「在制 + 已签收 = 揽收累计」
  signedToday = funnel[4]
  // 回填的历史运单按线路单量平均分到两个方向，保证 OD 图启动即有数据
  metrics.routes.forEach((count, index) => {
    const [a, b] = ROUTES[index]
    addOd(provinceOf(a), provinceOf(b), Math.ceil(count / 2))
    addOd(provinceOf(b), provinceOf(a), Math.floor(count / 2))
  })
}

function addOd(from, to, value) {
  const key = `${from}>${to}`
  od.set(key, (od.get(key) ?? 0) + value)
}

function create(routeIdx, now) {
  const [a, b] = ROUTES[routeIdx]
  const forward = Math.random() < 0.5
  const [fromId, toId] = forward ? [a, b] : [b, a]
  const linehaul = routeKm(routeIdx) / LINEHAUL_KMH
  const planned = ((PICKUP[0] + PICKUP[1]) / 2 + (SORT[0] + SORT[1]) / 2 + linehaul + (DELIVER[0] + DELIVER[1]) / 2) * 1.15
  // 约 12% 的运单在某一段额外耽搁 2–12 分钟（≈ 真实 2–12 小时）
  const hiccup = Math.random() < 0.12 ? rand(2, 12) : 0
  const durations = [rand(...PICKUP), rand(...SORT), linehaul * rand(0.95, 1.1), rand(...DELIVER)]
  durations[Math.floor(Math.random() * 4)] += hiccup
  const shipment = { id: ++seq, routeIdx, fromId, toId, stage: 0, createdAt: now, nextAt: now + durations[0] * MINUTE, durations, planned }
  live.push(shipment)
  funnel[0]++
  inStage[0]++
  addOd(provinceOf(fromId), provinceOf(toId), 1)
}

function advance(shipment, now) {
  inStage[shipment.stage]--
  shipment.stage++
  funnel[shipment.stage]++
  inStage[shipment.stage]++
  if (shipment.stage < 4) { shipment.nextAt = now + shipment.durations[shipment.stage] * MINUTE; return false }
  // 签收：按实际总时长与承诺比较分档
  const actualMin = (now - shipment.createdAt) / MINUTE
  const delay = actualMin - shipment.planned
  punctual[delay <= 0 ? 0 : delay <= 2 ? 1 : delay <= 6 ? 2 : 3]++
  signedToday++
  if (delay > 0) delayMinSum += delay
  inStage[4]--
  return true
}

/** 每个仿真步调用：按累计单量增量创建实体，并推进到期的实体 */
export function stepShipments(now = Date.now()) {
  const metrics = readMetrics(now)
  if (metrics.day !== day) { day = metrics.day; reset(metrics); lastRoutes = metrics.routes }
  for (let i = 0; i < ROUTES.length; i++) {
    const n = Math.min(500, metrics.routes[i] - lastRoutes[i])
    for (let k = 0; k < n && live.length < MAX_LIVE; k++) create(i, now)
  }
  lastRoutes = metrics.routes
  let write = 0
  for (let i = 0; i < live.length; i++) {
    const shipment = live[i]
    let done = false
    while (now >= shipment.nextAt && !done) done = advance(shipment, now)
    if (!done) live[write++] = shipment
  }
  live.length = write
}

/** 推送用聚合：漏斗累计、各段在制、签收与时效分布、省际 OD 前 N */
export function shipmentStats(topOd = 24) {
  const total = punctual.reduce((a, b) => a + b, 0)
  // 签收样本不足 50 单时沿用先验分布，避免启动时百分比乱跳
  const punctuality = total >= 50
    ? roundPercent(punctual.map((v) => v / total * 100))
    : PUNCTUAL_PRIOR.slice()
  const flows = [...od.entries()].map(([key, value]) => { const [from, to] = key.split('>'); return { from, to, value } })
    .sort((x, y) => y.value - x.value || x.from.localeCompare(y.from) || x.to.localeCompare(y.to))
  // 省内流向（珠三角互发）远大于省际，桑基图只画省际，省内只给合计
  const inter = flows.filter((f) => f.from !== f.to)
  const odIntra = flows.reduce((sum, f) => sum + (f.from === f.to ? f.value : 0), 0)
  return {
    stages: STAGES,
    funnel: [...funnel],
    inStage: [...inStage],
    signedToday,
    live: live.length,
    avgDelayMin: signedToday ? Math.round(delayMinSum / signedToday * 10) / 10 : 0,
    punctuality: PUNCTUAL_NAMES.map((name, i) => ({ name, value: punctuality[i] })),
    od: inter.slice(0, topOd),
    odIntra,
    odTotal: flows.reduce((sum, f) => sum + f.value, 0),
  }
}

// 百分比取整后合计恒为 100
function roundPercent(values) {
  const rounded = values.map(Math.floor)
  const order = values.map((value, index) => ({ index, fraction: value - rounded[index] })).sort((a, b) => b.fraction - a.fraction)
  for (let i = 0, left = 100 - rounded.reduce((a, b) => a + b, 0); i < left; i++) rounded[order[i].index]++
  return rounded
}

/** 测试用：当前在制实体 */
export function liveShipments() { return live }
