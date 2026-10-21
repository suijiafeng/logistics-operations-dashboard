// 业务时钟独立于加速车辆：小时目标、分时、KPI、线路累计使用同一批仿真运单。
import { HUBS, ROUTES } from './network.js'

const HOUR = 3_600_000
const DAY = HOUR * 24
const OFFSET = HOUR * 8
const profiles = new Map()

function randomFor(key) {
  let seed = 2166136261
  for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}

function profileAt(now) {
  const start = Math.floor((now + OFFSET) / DAY) * DAY - OFFSET
  if (profiles.has(start)) return profiles.get(start)
  const random = randomFor(String(start))
  const targets = Array.from({ length: 24 }, (_, hour) => {
    const peak = (hour >= 8 && hour <= 11) || (hour >= 14 && hour <= 17) || (hour >= 20 && hour <= 22)
    const [min, max] = peak ? [9800, 14200] : hour < 6 ? [900, 2600] : [4200, 8600]
    return Math.floor(min + random() * (max - min))
  })
  const bags = targets.map(() => ROUTES.flatMap((route, index) =>
    Array(Math.max(1, Math.round(route[2] * (0.75 + random() * 0.5)))).fill(index)))
  const profile = { start, targets, bags }
  profiles.set(start, profile)
  if (profiles.size > 3) profiles.delete(profiles.keys().next().value)
  return profile
}

function countsAt(profile, time) {
  const routes = Array(ROUTES.length).fill(0)
  const trend = profile.targets.map((target, hour) => {
    const progress = Math.max(0, Math.min(1, (time - profile.start - hour * HOUR) / HOUR))
    const count = Math.floor(target * progress)
    const bag = profile.bags[hour]
    const cycles = Math.floor(count / bag.length)
    const remainder = count % bag.length
    for (let i = 0; i < bag.length; i++) routes[bag[i]] += cycles + (i < remainder ? 1 : 0)
    return count
  })
  return { routes, trend }
}

export function readMetrics(now = Date.now()) {
  const profile = profileAt(now)
  const hour = Math.floor((now - profile.start) / HOUR)
  const { routes, trend } = countsAt(profile, now)
  return { day: profile.start, hour, routes, targets: [...profile.targets],
    trend: trend.map((value, index) => index > hour ? null : value),
    ordersToday: trend.reduce((sum, value) => sum + value, 0) }
}

// 昨日分时：与今日同一确定性规则生成，昨日已整天完成，即各小时目标值（与昨日实际推送一致）
export function readYesterdayTrend(now = Date.now()) {
  return [...profileAt(profileAt(now).start - 1).targets]
}

export function readModes(now = Date.now()) {
  const base = [46, 27, 15, 12]
  const names = ['干线运输', '城市配送', '快递专线', '冷链运输']
  const weights = base.map((value, i) => value + Math.sin(now / 300_000 + i * 1.7) * 1.25)
  const sum = weights.reduce((total, value) => total + value, 0)
  const values = weights.map((value) => value / sum * 100)
  const rounded = values.map(Math.floor)
  const order = values.map((value, index) => ({ index, fraction: value - rounded[index] })).sort((a, b) => b.fraction - a.fraction)
  for (let i = 0, left = 100 - rounded.reduce((a, b) => a + b, 0); i < left; i++) rounded[order[i].index]++
  return names.map((name, index) => ({ name, value: rounded[index] }))
}

function intervalCounts(start, end) {
  const result = Array(ROUTES.length).fill(0)
  for (let cursor = start; cursor < end;) {
    const profile = profileAt(cursor)
    const stop = Math.min(end, profile.start + DAY)
    const before = countsAt(profile, cursor).routes
    const after = countsAt(profile, stop).routes
    for (let i = 0; i < result.length; i++) result[i] += after[i] - before[i]
    cursor = stop
  }
  return result
}

export function readHubHistory(now = Date.now()) {
  const period = 300_000
  const current = Math.floor(now / period) * period
  const result = Object.fromEntries(HUBS.map((hub) => [hub.id, { recentOrders: [], recentLabels: [] }]))
  for (let index = 11; index >= 0; index--) {
    const start = current - index * period
    const counts = intervalCounts(start, Math.min(start + period, now))
    const time = new Date(start + OFFSET)
    const label = `${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')}`
    for (const hub of HUBS) {
      // 每条干线的运单各归入起终点一次，表示网点关联运单，不能跨网点相加当全网单量。
      const total = counts.reduce((sum, count, i) => sum + (ROUTES[i][0] === hub.id || ROUTES[i][1] === hub.id ? count : 0), 0)
      result[hub.id].recentOrders.push(total)
      result[hub.id].recentLabels.push(label)
    }
  }
  return result
}
