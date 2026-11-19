<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { useFocus } from '../services/useFocus'
import { hubById } from '../data/network'
import { fetchVehicle } from '../services/vehicles'
import { fetchVehicleTrail, fetchVehicleTemps, type TempSeries } from '../services/history'
import { areaFade, AXIS_CLEAN, SPLIT_LINE, TEXT, TOOLTIP, useEcharts } from '../services/useEcharts'
import { COLORS, FONT } from '../design/tokens'
import { fmtInt } from '../services/format'

// 车辆抽屉：详情由 /vehicles/:plate 每 2 秒轮询（速度、朝向、里程、ETA），位置由地图按 1Hz 增量包下标跟随
const POLL_MS = 2000
const STATUS_TEXT = ['在途', '装卸中', '异常']
const STATUS_CLASS = ['ok', 'dwell', 'alert']
const store = useDashboardStore()
const { focusHub } = useFocus()
const loading = ref(false)
let timer: number | undefined
// 冷链温度曲线：每 10 秒拉一次最近 1 小时序列，范围带 + 目标线 + 当前值
const temps = ref<TempSeries | null>(null)
const { el: tempEl, chart: tempChart } = useEcharts()
let tempTimer: number | undefined
const isCold = computed(() => detail.value?.kind === 1)
const scoreTone = computed(() => { const s = detail.value?.score ?? 100; return s < 80 ? 'danger' : s < 90 ? 'warn' : 'ok' })
async function loadTemps(value: string) {
  try {
    const series = await fetchVehicleTemps(value)
    if (plate.value === value) temps.value = series
  } catch { /* 曲线失败不影响其余详情 */ }
}
function renderTemps() {
  const c = tempChart.value, t = temps.value
  if (!c || !t) return
  const data = t.samples.map(([ts, v]) => [ts, v])
  const values = data.map((d) => d[1]!)
  const lo = Math.min(t.lo - 3, ...values), hi = Math.max(t.hi + 3, ...values)
  c.setOption({
    grid: { left: 4, right: 6, top: 8, bottom: 2, containLabel: true },
    tooltip: { ...TOOLTIP, trigger: 'axis', formatter: (ps: { value: [number, number] }[]) => {
      const p = ps[0]; if (!p) return ''
      return `${new Date(p.value[0]).toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })} · ${p.value[1].toFixed(1)}℃`
    } },
    xAxis: { type: 'time', ...AXIS_CLEAN,
      axisLabel: { ...TEXT, fontFamily: FONT.number, hideOverlap: true, formatter: (v: number) => new Date(v).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }) } },
    yAxis: { type: 'value', min: Math.floor(lo), max: Math.ceil(hi), splitNumber: 3, ...AXIS_CLEAN, splitLine: SPLIT_LINE,
      axisLabel: { ...TEXT, fontFamily: FONT.number, formatter: '{value}℃' } },
    series: [{
      type: 'line', data, showSymbol: false, smooth: false,
      lineStyle: { color: COLORS.cold, width: 1.5 }, areaStyle: { color: areaFade(94, 184, 201) },
      markArea: { silent: true, itemStyle: { color: 'rgba(52, 199, 123, 0.12)' }, data: [[{ yAxis: t.lo }, { yAxis: t.hi }]] },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: COLORS.secondary, type: 'dashed', width: 1 }, label: { show: false }, data: [{ yAxis: t.target }] },
    }],
  }, { notMerge: true })
}
watch([tempChart, temps], renderTemps)
let controller: AbortController | undefined

const plate = computed(() => store.selectedPlate)
const detail = computed(() => store.vehicle)
const from = computed(() => detail.value ? hubById[detail.value.fromId] : undefined)
const to = computed(() => detail.value ? hubById[detail.value.toId] : undefined)
const progress = computed(() => {
  const d = detail.value
  return d && d.routeKm > 0 ? Math.max(0, Math.min(100, Math.round(d.traveledKm / d.routeKm * 100))) : 0
})
const eta = computed(() => {
  const min = detail.value?.etaMin
  if (min == null) return '—'
  return min >= 60 ? `${Math.floor(min / 60)} 小时 ${min % 60} 分` : `${min} 分钟`
})
const heading = computed(() => {
  const deg = detail.value?.heading
  if (deg == null) return ''
  const names = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return `${names[Math.round(deg / 45) % 8]} ${deg}°`
})

async function poll() {
  const current = plate.value
  if (!current) return
  controller?.abort()
  controller = new AbortController()
  loading.value = !store.vehicle
  try {
    const data = await fetchVehicle(current, controller.signal)
    if (plate.value !== current) return
    if (!data) { store.vehicleError = '车辆不存在或已下线'; store.vehicle = null; return }
    store.vehicle = data
    store.vehicleError = ''
  } catch (error) {
    if ((error as Error).name === 'AbortError' || plate.value !== current) return
    store.vehicleError = `车辆详情暂不可用：${(error as Error).message}`
  } finally {
    if (plate.value === current) loading.value = false
  }
}

function stop() {
  window.clearInterval(timer)
  window.clearInterval(tempTimer)
  timer = tempTimer = undefined
  controller?.abort()
  controller = undefined
  temps.value = null
}

// 尾迹：选中时拉一次最近 1 小时（10 秒一帧），之后由 store 按 1Hz 增量追加
async function loadTrail(value: string) {
  try {
    const trail = await fetchVehicleTrail(value)
    if (plate.value === value) store.trail = { plate: value, points: trail.points }
  } catch (error) {
    if (plate.value === value) store.notify(`尾迹加载失败：${(error as Error).message}`)
  }
}
const trailMinutes = computed(() => {
  const points = store.trail?.points
  if (!points?.length || store.trail?.plate !== plate.value) return 0
  return Math.max(1, Math.round((points[points.length - 1]![0] - points[0]![0]) / 60_000))
})

watch(plate, (value) => {
  stop()
  if (!value) return
  void poll()
  void loadTrail(value)
  timer = window.setInterval(() => { if (!document.hidden) void poll() }, POLL_MS)
}, { immediate: true })
// 详情到达后才知道是不是冷链车：是则开始拉温度曲线
watch(isCold, (cold) => {
  window.clearInterval(tempTimer)
  tempTimer = undefined
  if (!cold || !plate.value) return
  void loadTemps(plate.value)
  tempTimer = window.setInterval(() => { if (!document.hidden && plate.value) void loadTemps(plate.value) }, 10_000)
})
onBeforeUnmount(stop)
</script>

<template>
  <section v-if="plate && store.hasData" class="vehicle-detail" :class="store.detailSide" aria-label="车辆详情">
    <header>
      <div class="titles">
        <h4 :title="plate">{{ plate }}</h4>
        <p v-if="detail">
          <span class="status" :class="STATUS_CLASS[detail.status] ?? 'ok'">{{ STATUS_TEXT[detail.status] ?? '未知' }}</span>
          · 追踪中 · 位置每秒更新
        </p>
        <p v-else-if="store.vehicleError" class="err">{{ store.vehicleError }}</p>
        <p v-else>{{ loading ? '正在读取车辆详情…' : '' }}</p>
      </div>
      <button class="close" aria-label="关闭车辆详情（Esc）" @click="store.selectVehicle(null)">×</button>
    </header>

    <template v-if="detail && from && to">
      <div class="route">
        <button class="hub" :title="`${from.name} · ${from.site} · 点击查看网点`" @click="focusHub(from.id)">{{ from.name }}</button>
        <span class="arrow" aria-hidden="true">→</span>
        <button class="hub" :title="`${to.name} · ${to.site} · 点击查看网点`" @click="focusHub(to.id)">{{ to.name }}</button>
      </div>
      <div class="progress" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" :aria-label="`已行驶 ${progress}%`">
        <div class="bar"><div class="fill" :style="{ width: `${progress}%` }" /></div>
        <div class="progress-labels">
          <span>已行驶 {{ fmtInt(detail.traveledKm) }} km</span>
          <span>剩余 {{ fmtInt(detail.remainingKm) }} km</span>
        </div>
      </div>

      <div class="driver" :title="`${detail.driver} · 安全评分 ${detail.score}（100 分起扣：超速 -2、急刹 -1、疲劳 -5）· 今日超速 ${detail.safety.speeding} 急刹 ${detail.safety.braking} 疲劳 ${detail.safety.fatigue}`">
        <span class="name">{{ detail.driver }}</span>
        <span v-if="isCold" class="tag cold">冷链</span>
        <span class="score" :class="scoreTone">安全 {{ detail.score }} 分</span>
        <span class="counts">超{{ detail.safety.speeding }} 刹{{ detail.safety.braking }} 疲{{ detail.safety.fatigue }}</span>
      </div>

      <section v-if="isCold" class="temp">
        <div class="temp-head">
          <span>厢体温度<em v-if="detail.overTemp" class="hot">超温</em></span>
          <b :class="{ hot: detail.overTemp }">{{ detail.temp?.toFixed(1) }}℃</b>
          <small>范围 {{ detail.tempLo }}…{{ detail.tempHi }}℃</small>
        </div>
        <div ref="tempEl" class="temp-chart" role="img" :aria-label="`最近 1 小时厢体温度曲线，当前 ${detail.temp}℃，允许范围 ${detail.tempLo} 到 ${detail.tempHi}℃`" />
        <p class="temp-note">{{ temps ? `最近 ${Math.round(temps.samples.length * temps.interval / 60_000)} 分钟 · 10 秒一采 · 绿带为允许范围，虚线为设定温度` : '温度曲线加载中…' }}</p>
      </section>

      <dl class="metrics">
        <div class="metric"><dt>当前车速</dt><dd><span class="v">{{ detail.speedKmh }}</span><small>km/h</small></dd></div>
        <div class="metric"><dt>预计到达</dt><dd><span class="v eta">{{ eta }}</span></dd></div>
        <div class="metric"><dt>行驶朝向</dt><dd><span class="v">{{ heading }}</span></dd></div>
        <div class="metric"><dt>干线全长</dt><dd><span class="v">{{ fmtInt(detail.routeKm) }}</span><small>km</small></dd></div>
      </dl>
      <p class="coords" :title="`${detail.position[0].toFixed(5)}, ${detail.position[1].toFixed(5)}（WGS84）`">
        {{ detail.position[0].toFixed(4) }}°E {{ detail.position[1].toFixed(4) }}°N · 沿真实公路折线行驶，仿真 60× 加速
      </p>
      <p class="coords">{{ trailMinutes ? `地图尾迹：最近 ${trailMinutes} 分钟（10 秒一帧，选中后按秒追加）` : '尾迹加载中…' }}{{ store.playback.on ? ' · 回放中：箭头与尾迹为历史帧，以上详情为实时' : '' }}</p>
    </template>
  </section>
</template>

<style scoped>
.vehicle-detail {
  position: absolute;
  top: 52px;
  width: 300px;
  max-width: calc(100% - 32px);
  max-height: calc(100% - 68px);
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--color-overlay);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  padding: 14px var(--space-4) var(--space-4);
  box-shadow: var(--shadow-panel);
  z-index: 5;
}
.vehicle-detail.left { right: auto; left: var(--space-4); }
.vehicle-detail.right { right: var(--space-4); left: auto; }
header { display: flex; align-items: flex-start; gap: var(--space-2); }
.titles { flex: 1; min-width: 0; }
h4 { font-family: var(--font-number); font-size: 18px; font-weight: 700; color: var(--color-heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.titles p { font-size: var(--font-small); color: var(--color-tertiary); }
.titles .err { color: var(--color-dangerText); white-space: normal; }
.status { font-weight: 500; }
.status.ok { color: var(--color-accentText); }
.status.dwell { color: var(--color-secondary); }
.status.alert { color: var(--color-dangerText); }
.close { flex: none; background: none; border: none; color: var(--color-tertiary); font-size: 18px; line-height: 1; cursor: pointer; border-radius: var(--radius-control); }
.close:hover { background: var(--color-hover); color: var(--color-heading); }

.driver { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: var(--space-3); font-size: var(--font-small); }
.driver .name { color: var(--color-heading); font-weight: 500; }
.tag { padding: 0 6px; border: 1px solid var(--color-border); border-radius: 999px; font-size: 12px; line-height: 18px; }
.tag.cold { color: var(--color-secondary); }
.score { padding: 0 6px; border-radius: 999px; font-family: var(--font-number); font-size: 12px; line-height: 18px; background: var(--color-elevated); color: var(--color-heading); font-variant-numeric: tabular-nums; }
.score.warn { color: var(--color-warning); }
.score.danger { color: var(--color-dangerText); }
.driver .counts { font-size: 12px; color: var(--color-tertiary); }
.temp { margin-top: var(--space-3); padding-top: 8px; border-top: 1px solid var(--color-border); }
.temp-head { display: flex; align-items: baseline; gap: var(--space-2); font-size: var(--font-small); color: var(--color-secondary); }
.temp-head b { font-family: var(--font-number); font-size: 18px; color: var(--color-heading); font-variant-numeric: tabular-nums; }
.temp-head b.hot, .temp-head .hot { color: var(--color-dangerText); }
.temp-head em { font-style: normal; margin-left: 6px; font-size: 12px; }
.temp-head small { margin-left: auto; font-size: 12px; color: var(--color-tertiary); }
.temp-chart { height: 84px; margin-top: 4px; }
.temp-note { margin-top: 2px; font-size: 12px; color: var(--color-tertiary); }
.route { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-4); }
.hub {
  flex: 1;
  min-width: 0;
  min-height: 32px;
  padding: 0 10px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  color: var(--color-heading);
  font-size: var(--font-body);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.hub:hover { border-color: var(--color-border); background: var(--color-hover); }
.arrow { flex: none; color: var(--color-accent); font-weight: 700; }
.progress { margin-top: var(--space-3); }
.bar { height: 6px; background: var(--color-track); border-radius: 3px; overflow: hidden; }
.fill { height: 100%; background: var(--color-accent); border-radius: 3px; transition: width 150ms ease-out; }
.progress-labels { display: flex; justify-content: space-between; margin-top: 4px; font-family: var(--font-number); font-size: 12px; color: var(--color-tertiary); font-variant-numeric: tabular-nums; }

.metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: var(--space-4); border-top: 1px solid var(--color-border); }
.metric { min-width: 0; padding: 8px 10px 8px 0; }
.metric:nth-child(odd) { border-right: 1px solid var(--color-border); padding-right: 10px; }
.metric:nth-child(even) { padding-left: 10px; }
.metric:nth-child(n + 3) { border-top: 1px solid var(--color-border); }
.metric dt { font-size: var(--font-small); color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.metric dd { display: flex; align-items: baseline; gap: 3px; min-width: 0; }
.metric .v { min-width: 0; font-family: var(--font-number); font-size: 20px; font-weight: 600; color: var(--color-heading); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.metric .v.eta { font-size: 16px; }
.metric small { flex: none; font-size: var(--font-small); color: var(--color-tertiary); }
.coords { margin-top: var(--space-3); font-size: 12px; color: var(--color-tertiary); line-height: 1.5; font-variant-numeric: tabular-nums; }
</style>
