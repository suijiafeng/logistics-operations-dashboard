<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { useEcharts, ACCENT, RED, TOOLTIP, TEXT } from '../services/useEcharts'
import { COLORS, FONT } from '../design/tokens'
import { useChartMotion } from '../services/useChartMotion'
import { useMediaQuery } from '../services/useMediaQuery'
import { useDashboardStore } from '../stores/dashboard'
import { HUBS, ROUTES, hubById } from '../data/network'
import chinaGeo from '../assets/geo/china.json'

const store = useDashboardStore()
const { el, chart } = useEcharts()
const motion = useChartMotion()
const coarse = useMediaQuery('(pointer: coarse)')
echarts.registerMap('china', chinaGeo as never)

let gdRegistered = false
let containsGuangdong: ((lng: number, lat: number) => boolean) | undefined
let rafPending = false
let rafId = 0
let feedTimer: number | undefined
let transitionTimer: number | undefined
let buildVersion = 0
let disposed = false
const switching = ref(false)
const mapError = ref('')
let fedCount = 0 // 首屏分片渐进：已喂入的车辆数

const STATUS_COLORS = [COLORS.accentText, COLORS.muted, RED] // 在途 / 装卸 / 异常
const STATUS_SIZES = [4, 4, 6]

function inView(lng: number, lat: number) {
  if (store.view === 'china') return true
  return containsGuangdong?.(lng, lat) ?? false
}

function visibleHubs() {
  return HUBS.filter((h) => inView(h.lng, h.lat))
}

/** 把扁平车辆数组按状态拆成三组散点数据（只取前 limit 台做分片渐进） */
function vehicleSeriesData(limit: number) {
  const groups: [number, number][][] = [[], [], []]
  const flat = store.vehicles
  const total = Math.min(limit, store.vehicleCount, Math.floor(flat.length / 3))
  const budget = store.quality === 'full' ? total : store.quality === 'balanced' ? 6000 : 3000
  const stride = Math.max(1, Math.ceil(total / budget))
  for (let i = 0; i < total; i++) {
    const lng = flat[i * 3]
    const lat = flat[i * 3 + 1]
    const status = flat[i * 3 + 2]
    if (status === 0 && i % stride !== 0) continue
    if (!inView(lng, lat)) continue
    groups[status]?.push([lng, lat])
  }
  return groups
}

function renderVehicles(limit = Number.POSITIVE_INFINITY) {
  const c = chart.value
  if (!c) return
  const groups = vehicleSeriesData(limit)
  store.renderedVehicles = groups.reduce((sum, group) => sum + group.length, 0)
  // 增量更新：只替换三组车辆散点的数据，不重建整个 option
  c.setOption({
    series: groups.map((data, s) => ({ id: `veh-${s}`, data })),
  })
}

function scheduleVehicleRender() {
  if (rafPending) return
  rafPending = true
  rafId = requestAnimationFrame(() => {
    rafPending = false
    renderVehicles()
  })
}

/** 首屏分片渐进：快照到达后分三段喂入，避免 1.2 万点一次性阻塞主线程 */
function progressiveFeed() {
  window.clearTimeout(feedTimer)
  fedCount = 0
  const steps = [4000, 8000, store.vehicleCount]
  let idx = 0
  const next = () => {
    if (idx >= steps.length) return
    fedCount = steps[idx++]
    renderVehicles(fedCount)
    if (idx < steps.length) feedTimer = window.setTimeout(next, 160)
  }
  next()
}

function hubData() {
  return visibleHubs().map((h) => {
    const selected = h.id === store.selectedHubId
    return {
      name: h.name, hubId: h.id, level: h.level, value: [h.lng, h.lat],
      symbolSize: selected ? 18 : h.level === 1 ? 13 : h.level === 2 ? 10 : 8,
      itemStyle: { color: selected ? COLORS.accentValue : ACCENT, borderColor: selected ? ACCENT : 'transparent', borderWidth: 2 },
      label: {
        show: store.view === 'guangdong' || h.level === 1 || selected,
        position: h.id === 'fs' || h.id === 'zh' ? 'left' : h.id === 'dg' || h.id === 'gz' ? 'top' : 'right',
        offset: h.id === 'fs' ? [-8, 12] : h.id === 'gz' ? [-8, -16] : h.id === 'dg' ? [16, -8] : [0, 0],
        color: selected ? COLORS.accentValue : COLORS.text,
      },
    }
  })
}

function hitData() {
  return coarse.value ? visibleHubs().map((hub) => ({ name: hub.name, hubId: hub.id, value: [hub.lng, hub.lat] })) : []
}

function routeCoords(index: number) {
  const [a, b] = ROUTES[index]
  const start = hubById[a], end = hubById[b]
  const bend = (index % 2 === 0 ? 1 : -1) * (0.08 + (index % 5) * 0.02)
  const cx = (start.lng + end.lng) / 2 - (end.lat - start.lat) * bend
  const cy = (start.lat + end.lat) / 2 + (end.lng - start.lng) * bend
  return Array.from({ length: 25 }, (_, i) => {
    const t = i / 24, u = 1 - t
    return [u * u * start.lng + 2 * u * t * cx + t * t * end.lng,
      u * u * start.lat + 2 * u * t * cy + t * t * end.lat]
  })
}

function eventRouteData() {
  const event = store.activeEvent
  if (!event) return []
  const index = event.routeIndex ?? ROUTES.findIndex(([a, b]) =>
    (a === event.fromId && b === event.toId) || (a === event.toId && b === event.fromId))
  return index >= 0 && index < ROUTES.length ? [{ coords: routeCoords(index) }] : []
}

function eventPositionData() {
  const event = store.activeEvent
  if (!event?.position || !inView(event.position[0], event.position[1])) return []
  return [{ name: `事件发生位置 · ${event.vehicle}`, value: event.position }]
}

function hubTooltip(p: { data?: { name?: string; hubId?: string } }) {
  return `网点：${p.data?.name ?? ''}（${p.data?.hubId === store.selectedHubId ? '已选中' : '点击查看详情'}）`
}

function updateSelection() {
  const c = chart.value
  if (!c) return
  c.dispatchAction({ type: 'hideTip' })
  c.setOption({ series: [
    { id: 'hubs', data: hubData() },
    { id: 'hub-hit', data: hitData() },
    { id: 'event-route', data: eventRouteData() },
    { id: 'event-position', data: eventPositionData() },
  ] })
  const hub = store.selectedHub
  if (hub) {
    const pixel = c.convertToPixel({ geoIndex: 0 }, [hub.lng, hub.lat]) as number[] | undefined
    if (pixel) store.detailSide = pixel[0] > c.getWidth() / 2 ? 'left' : 'right'
  }
}

function baseOption() {
  const hubs = visibleHubs()
  const hubIds = new Set(hubs.map((h) => h.id))
  const lines = ROUTES.flatMap(([a, b], index) => hubIds.has(a) && hubIds.has(b) ? [{ coords: routeCoords(index) }] : [])
  return {
    animation: motion.value,
    textStyle: TEXT,
    backgroundColor: 'transparent',
    tooltip: {
      ...TOOLTIP,
      trigger: 'item',
      triggerOn: 'mousemove',
      hideDelay: 0,
    },
    geo: {
      map: store.view,
      roam: false,
      layoutCenter: ['50%', '50%'],
      layoutSize: '96%',
      itemStyle: { areaColor: COLORS.mapArea, borderColor: COLORS.mapBorder, borderWidth: 0.8 },
      emphasis: { disabled: true, label: { show: false } },
      select: { disabled: true },
      label: { show: false },
      tooltip: { formatter: (p: { name: string }) => store.view === 'china' && p.name === '广东省' ? '广东省 · 点击下钻' : '' },
      regions: [{ name: '广东省', itemStyle: { areaColor: COLORS.mapProvince },
        emphasis: { disabled: false, itemStyle: { areaColor: COLORS.mapHover }, label: { show: false } } }],
    },
    series: [
      {
        id: 'lines',
        type: 'lines',
        coordinateSystem: 'geo',
        zlevel: 1,
        polyline: true,
        silent: true,
        lineStyle: { color: COLORS.route, width: 1, opacity: 0.55 },
        effect: { show: motion.value, period: 9, trailLength: 0.08, symbolSize: 2, color: COLORS.accentText },
        data: lines,
      },
      ...[0, 1, 2].map((s) => ({
        id: `veh-${s}`,
        type: 'scatter',
        coordinateSystem: 'geo',
        zlevel: 2,
        symbolSize: STATUS_SIZES[s],
        large: true,
        largeThreshold: 2000,
        progressive: 3000,
        progressiveThreshold: 6000,
        itemStyle: { color: STATUS_COLORS[s], opacity: s === 0 ? 0.9 : 0.95 },
        data: [] as [number, number][],
        silent: true,
      })),
      {
        id: 'hubs',
        type: motion.value ? 'effectScatter' : 'scatter',
        coordinateSystem: 'geo',
        zlevel: 3,
        rippleEffect: { brushType: 'stroke', scale: 2.6 },
        symbolSize: (val: unknown, params: { data?: { level?: number } }) =>
          params.data?.level === 1 ? 13 : params.data?.level === 2 ? 10 : 8,
        itemStyle: { color: ACCENT },
        label: {
          show: true,
          formatter: (p: { data?: { name?: string } }) => p.data?.name ?? '',
          position: 'right',
          color: COLORS.text,
          fontSize: FONT.small,
        },
        labelLayout: { hideOverlap: true },
        emphasis: { label: { show: true } },
        tooltip: {
          formatter: hubTooltip,
        },
        data: hubData(),
      },
      {
        id: 'hub-hit', type: 'scatter', coordinateSystem: 'geo', zlevel: 4,
        symbolSize: 44, itemStyle: { color: 'rgba(255,138,61,0.001)' },
        emphasis: { disabled: true }, tooltip: { formatter: hubTooltip },
        data: hitData(),
      },
      {
        id: 'event-route', type: 'lines', coordinateSystem: 'geo', zlevel: 5,
        polyline: true, silent: true, lineStyle: { color: COLORS.dangerText, width: 3, opacity: 1 },
        data: eventRouteData(),
      },
      {
        id: 'event-position', type: 'scatter', coordinateSystem: 'geo', zlevel: 6,
        symbol: 'pin', symbolSize: 30, itemStyle: { color: RED },
        label: { show: true, formatter: '{b}', position: 'top', color: COLORS.dangerText, fontSize: FONT.small },
        tooltip: { formatter: '事件发生位置（不是实时车辆追踪）' }, data: eventPositionData(),
      },
    ],
  }
}

async function ensureGuangdong() {
  if (gdRegistered) return
  const gd = await import('../data/guangdong')
  echarts.registerMap('guangdong', gd.default as never)
  containsGuangdong = gd.inGuangdong
  gdRegistered = true
}

async function rebuildMap() {
  const c = chart.value
  if (!c) return
  const version = ++buildVersion
  switching.value = true
  mapError.value = ''
  window.clearTimeout(feedTimer)
  window.clearTimeout(transitionTimer)
  try {
    if (store.view === 'guangdong') await ensureGuangdong()
    if (disposed || version !== buildVersion || chart.value !== c) return
    c.setOption(baseOption(), { notMerge: true })
    progressiveFeed()
    updateSelection()
  } catch (error) {
    if (disposed || version !== buildVersion) return
    mapError.value = '地图加载失败，请返回全国后重试'
    console.error('地图切换失败', error)
  } finally {
    if (!disposed && version === buildVersion) {
      transitionTimer = window.setTimeout(() => { switching.value = false }, 100)
    }
  }
}

watch(chart, (c) => {
  if (!c) return
  void rebuildMap()
  c.on('click', (params) => {
    c.dispatchAction({ type: 'hideTip' })
    if (params.seriesId === 'hubs' || params.seriesId === 'hub-hit') {
      const hubId = (params.data as { hubId?: string })?.hubId
      if (hubId) store.selectHub(hubId)
    } else if (params.componentType === 'geo' && params.name === '广东省' && store.view === 'china') {
      store.clearSelection()
      store.setView('guangdong')
    } else if (params.seriesId !== 'event-position') {
      store.clearSelection()
    }
  })
  c.getZr().on('click', (event) => {
    if (!event.target) store.clearSelection()
  })
}, { flush: 'post' })

onBeforeUnmount(() => {
  disposed = true
  buildVersion++
  cancelAnimationFrame(rafId)
  window.clearTimeout(feedTimer)
  window.clearTimeout(transitionTimer)
})

watch([() => store.selectedHubId, () => store.activeEvent, coarse], updateSelection)
watch(motion, () => { void rebuildMap() })
watch(() => store.quality, scheduleVehicleRender)

// 视图切换（全国 ↔ 广东下钻）时整图重建
watch(
  () => store.view,
  () => rebuildMap(),
)

// 快照/增量到达：首屏走分片渐进，之后走 rAF 帧合并的增量更新
watch(
  () => store.mapVersion,
  (v, old) => {
    if (old === 0 || fedCount < store.vehicleCount) {
      if (store.vehicleCount > 0) progressiveFeed()
    } else {
      scheduleVehicleRender()
    }
  },
)
</script>

<template>
  <div class="map-wrap">
    <div ref="el" class="map-chart" :class="{ switching }" />
    <p v-if="!store.hasData" class="map-loading">{{ store.dataStatus === 'error' ? '车辆数据暂不可用' : '正在加载车辆数据…' }}</p>
    <p v-if="mapError" class="map-error" role="alert">{{ mapError }}</p>
    <div class="map-legend">
      <span><i class="dot enroute" />在途</span>
      <span><i class="dot dwell" />装卸</span>
      <span><i class="dot anomaly" />异常</span>
      <span class="hint">{{ store.view === 'china' ? '点击广东省下钻 · 点击网点看详情' : '广东省内网点与车辆' }}</span>
    </div>
    <button v-if="store.view === 'guangdong'" class="back-btn" @click="store.clearSelection(); store.setView('china')">返回全国</button>
    <slot />
  </div>
</template>

<style scoped>
.map-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--color-panel);
  border-radius: var(--radius-panel);
  overflow: hidden;
}
.map-chart {
  position: absolute;
  inset: 0;
  transition: opacity 0.2s ease;
  touch-action: none;
}
.map-chart.switching { opacity: 0.25; }
.map-loading { position: absolute; top: var(--space-4); left: var(--space-4); padding: var(--space-2); color: var(--color-secondary); background: var(--color-panel); }
.map-error { position: absolute; top: 16px; left: 150px; color: var(--color-dangerText); font-size: var(--font-body); }
.map-legend {
  position: absolute;
  left: 14px;
  bottom: 12px;
  display: flex;
  gap: var(--space-4);
  align-items: center;
  font-size: var(--font-small);
  color: var(--color-secondary);
  background: var(--color-legend);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-control);
}
.map-legend .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: var(--space-1);
}
.dot.enroute { background: var(--color-accentText); }
.dot.dwell { background: var(--color-muted); }
.dot.anomaly { background: var(--color-danger); }
.map-legend .hint {
  color: var(--color-secondary);
}
.back-btn {
  position: absolute;
  top: 12px;
  left: 14px;
  background: var(--color-accent);
  color: var(--color-onAccent);
  border: none;
  border-radius: var(--radius-control);
  padding: var(--space-1) var(--space-4);
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
}
.back-btn:hover { background: var(--color-accentText); }
@media (max-width: 767px) {
  .map-legend { right: var(--space-4); flex-wrap: wrap; gap: var(--space-2); }
  .map-legend .hint { flex-basis: 100%; }
}
</style>
