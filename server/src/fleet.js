// 车队扩展属性：冷链温控与司机安全。
// 冷链：约 12% 车辆为冷链车（与运输方式占比一致），冷冻 -25…-15℃ 或冷藏 0…10℃；温度围绕目标值随机游走，
// 偶发「制冷故障」让温度持续漂移，越界超过 30 秒触发「超温」告警（警告级），回到范围内即恢复。
// 安全：每车有司机与 100 分起的安全评分；在途时按概率产生超速 / 急刹 / 疲劳驾驶事件并扣分，疲劳驾驶同时进告警面板。
export const VEHICLE_KIND = 1000
const rand = (a, b) => a + Math.random() * (b - a)
const SURNAMES = '王李张刘陈杨黄赵周吴徐孙马朱胡郭何林罗高郑梁谢宋唐许韩冯邓曹彭曾萧田董袁潘蔡蒋余于杜叶程魏苏吕丁任卢姚沈钟姜崔谭陆范汪廖石金韦贾夏付方邹熊白孟秦邱侯江尹薛闫段雷龙黎史陶贺顾毛郝龚邵万钱严赖覃洪武莫孔汤向常温康施文牛樊葛邢安齐易'
const OVER_MARGIN = 1
const OVER_ALERT_SEC = 30
const TEMP_SAMPLES = 360
const SAFETY_LOG = 300
export const SAFETY_TYPES = { speeding: '超速', braking: '急刹', fatigue: '疲劳驾驶' }
const SAFETY_PENALTY = { speeding: 2, braking: 1, fatigue: 5 }
// 每车每分钟概率
const SAFETY_RATE = { speeding: 0.0012, braking: 0.0012, fatigue: 0.0003 }

const safetyLog = []
let safetySeq = 0
const todayCounts = { speeding: 0, braking: 0, fatigue: 0 }
let overTempAlertsToday = 0

export function initFleetExtras(vehicles) {
  vehicles.forEach((v, i) => {
    v.kind = Math.random() < 0.12 ? 1 : 0
    v.driver = `${SURNAMES[(i * 7919) % SURNAMES.length]}师傅·${String(1000 + (i % 9000)).padStart(4, '0')}`
    v.score = 100
    v.safety = { speeding: 0, braking: 0, fatigue: 0 }
    v.tempOverSince = 0
    v.tempAlertId = 0
    v.tempFaultUntil = 0
    if (v.kind === 1) {
      const frozen = Math.random() < 0.55
      v.tempLo = frozen ? -25 : 0
      v.tempHi = frozen ? -15 : 10
      v.tempTarget = frozen ? rand(-22, -18) : rand(2, 8)
      v.temp = v.tempTarget + rand(-0.8, 0.8)
      v.temps = []
    }
  })
}

export function resetFleetDaily(vehicles) {
  for (const v of vehicles) { v.score = 100; v.safety = { speeding: 0, braking: 0, fatigue: 0 } }
  safetyLog.length = 0
  todayCounts.speeding = todayCounts.braking = todayCounts.fatigue = 0
  overTempAlertsToday = 0
}

/** 每秒调用一次：温度随机游走、故障漂移、超温判定与告警 */
export function stepColdChain(vehicles, dtSec, now, hooks) {
  for (const v of vehicles) {
    if (v.kind !== 1) continue
    // 约每车每 4 小时一次制冷故障，持续 2–6 分钟，温度以 0.05–0.12℃/s 向外漂
    if (!v.tempFaultUntil && Math.random() < dtSec / 14_400) { v.tempFaultUntil = now + rand(120, 360) * 1000; v.tempDrift = rand(0.05, 0.12) * (v.tempTarget < 0 ? 1 : 1) }
    if (v.tempFaultUntil && now > v.tempFaultUntil) { v.tempFaultUntil = 0; v.tempDrift = 0 }
    const pull = v.tempFaultUntil ? 0 : 0.08
    v.temp += (v.tempTarget - v.temp) * pull * dtSec + rand(-0.15, 0.15) + (v.tempFaultUntil ? v.tempDrift * dtSec : 0)
    const over = v.temp > v.tempHi + OVER_MARGIN || v.temp < v.tempLo - OVER_MARGIN
    if (over) {
      if (!v.tempOverSince) v.tempOverSince = now
      else if (!v.tempAlertId && now - v.tempOverSince >= OVER_ALERT_SEC * 1000) {
        v.tempAlertId = hooks.alert(v, { type: '超温', level: 1, desc: `冷链温度 ${v.temp.toFixed(1)}℃，超出 ${v.tempLo}…${v.tempHi}℃ 范围已 ${OVER_ALERT_SEC} 秒` })
        overTempAlertsToday++
      }
    } else if (v.tempOverSince) {
      v.tempOverSince = 0
      if (v.tempAlertId) { hooks.recover(v.tempAlertId); v.tempAlertId = 0 }
    }
  }
}

/** 每秒调用一次：在途车辆按概率产生安全事件并扣分 */
export function stepSafety(vehicles, dtSec, now, hooks) {
  for (const v of vehicles) {
    if (v.status !== 0) continue
    for (const key of Object.keys(SAFETY_RATE)) {
      if (Math.random() >= SAFETY_RATE[key] * dtSec / 60) continue
      v.safety[key]++
      v.score = Math.max(0, v.score - SAFETY_PENALTY[key])
      todayCounts[key]++
      const speed = key === 'speeding' ? Math.round(v.speedKmh + rand(12, 30)) : v.speedKmh
      safetyLog.unshift({ id: ++safetySeq, ts: now, type: key, label: SAFETY_TYPES[key], plate: v.plate, driver: v.driver, routeIndex: v.routeIdx, speed, score: v.score })
      if (safetyLog.length > SAFETY_LOG) safetyLog.length = SAFETY_LOG
      if (key === 'fatigue') hooks.alert(v, { type: '疲劳驾驶', level: 1, desc: `${v.driver} 连续驾驶超过 4 小时，已提醒就近服务区休息` })
    }
  }
}

/** 随历史帧每 10 秒记一次冷链温度，每车保留 1 小时 */
export function recordTemps(vehicles, ts) {
  for (const v of vehicles) {
    if (v.kind !== 1) continue
    v.temps.push([ts, Math.round(v.temp * 10) / 10])
    if (v.temps.length > TEMP_SAMPLES) v.temps.shift()
  }
}

export function vehicleTemps(v) {
  if (v.kind !== 1) return null
  return { plate: v.plate, lo: v.tempLo, hi: v.tempHi, target: Math.round(v.tempTarget * 10) / 10, interval: 10_000, samples: v.temps.slice(), current: Math.round(v.temp * 10) / 10, overSince: v.tempOverSince || null }
}

/** 推送用：冷链车辆数、超温中车辆列表、今日超温告警数、平均偏差 */
export function coldStats(vehicles, limit = 8) {
  let count = 0, devSum = 0
  const over = []
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i]
    if (v.kind !== 1) continue
    count++
    devSum += Math.abs(v.temp - v.tempTarget)
    if (v.tempOverSince) over.push({ index: i, plate: v.plate, driver: v.driver, temp: Math.round(v.temp * 10) / 10, lo: v.tempLo, hi: v.tempHi, since: v.tempOverSince, alert: !!v.tempAlertId })
  }
  over.sort((a, b) => a.since - b.since)
  return { count, overCount: over.length, over: over.slice(0, limit), overIndices: over.map((o) => o.index), alertsToday: overTempAlertsToday, avgDeviation: count ? Math.round(devSum / count * 100) / 100 : 0 }
}

/** 推送用：今日各类事件数、评分最低司机排行、最近事件 */
export function safetyStats(vehicles, limit = 8) {
  const ranked = vehicles.map((v, index) => ({ index, plate: v.plate, driver: v.driver, score: v.score, ...v.safety }))
    .filter((d) => d.score < 100)
    .sort((a, b) => a.score - b.score || a.index - b.index)
  const avg = Math.round(vehicles.reduce((s, v) => s + v.score, 0) / vehicles.length * 10) / 10
  return { today: { ...todayCounts }, avgScore: avg, flagged: ranked.length, worst: ranked.slice(0, limit), recent: safetyLog.slice(0, 12) }
}
