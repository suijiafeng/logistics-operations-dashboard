<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import echarts from '../services/echarts'
import { useEcharts, ACCENT, RED, TOOLTIP, TEXT } from '../services/useEcharts'
import { COLORS, FONT } from '../design/tokens'
import { useChartMotion } from '../services/useChartMotion'
import { useMediaQuery } from '../services/useMediaQuery'
import { useDashboardStore } from '../stores/dashboard'
import { fmtInt } from '../services/format'
import { HUBS, ROUTES, hubById } from '../data/network'
import { routeCoords as routeGeometry, loadRoutes } from '../services/geo'
import chinaGeo from '../assets/geo/china.json'

const store = useDashboardStore()
const { el, chart, onResized } = useEcharts()
// 南海诸岛小图：独立实例，容器裁掉框外部分，只显示南海范围
const { el: insetEl, chart: insetChart } = useEcharts()
const motion = useChartMotion()
const coarse = useMediaQuery('(pointer: coarse)')
echarts.registerMap('china', chinaGeo as never)

type Geo = { features: { properties: { name?: string; adcode?: string | number }; geometry: { type: string; coordinates: number[][][][] } }[] }
// 主图只保留大陆与海南本岛：九段线和南海诸岛（北纬 18° 以南）让纬度跨度从约 50° 增加到 35°，
// 会把全国图压小；它们改由右下角的南海诸岛小图展示
const SCS_LAT = 18
function maxLat(poly: number[][][]) { let m = -90; for (const ring of poly) for (const p of ring) m = Math.max(m, p[1]); return m }
const chinaMain = {
  ...(chinaGeo as unknown as Geo),
  features: (chinaGeo as unknown as Geo).features
    .filter((f) => !String(f.properties.adcode).includes('JD'))
    .map((f) => f.properties.name !== '海南省' || f.geometry.type !== 'MultiPolygon' ? f
      : { ...f, geometry: { ...f.geometry, coordinates: f.geometry.coordinates.filter((poly) => maxLat(poly) >= SCS_LAT) } }),
}
echarts.registerMap('china-main', chinaMain as never)
// ECharts geo 宽高比 = 经度跨度 / 纬度跨度 × aspectScale(0.75)，用于按面板尺寸计算铺满时的 layoutSize
function geoAspect(geo: Geo) {
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90
  for (const f of geo.features) for (const poly of f.geometry.type === 'Polygon' ? [f.geometry.coordinates as unknown as number[][][]] : f.geometry.coordinates)
    for (const ring of poly) for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  return ((x1 - x0) / (y1 - y0)) * 0.75
}
const ASPECT: Record<string, number> = { china: geoAspect(chinaMain) }
// 珠三角 7 个网点在全国视图里挤在一起：名字收进一个聚合标签，点击下钻广东
const PRD = new Set(['gz', 'sz', 'dg', 'fs', 'zh', 'zs', 'hz'])

let gdRegistered = false
let containsGuangdong: ((lng: number, lat: number) => boolean) | undefined
let rafPending = false
let rafId = 0
let feedTimer: number | undefined
let transitionTimer: number | undefined
let buildVersion = 0
let disposed = false
const switching = ref(false)
// 图例计数：统计当前视图内全部车辆（不受画质抽稀影响）
const statusCounts = ref<[number, number, number]>([0, 0, 0])
const mapError = ref('')
let fedCount = 0 // 首屏分片渐进：已喂入的车辆数

const STATUS_COLORS = [COLORS.vehicle, COLORS.bar, RED] // 在途 / 装卸 / 异常
const STATUS_SIZES = [4, 4, 6]
const DRAWER_SPAN = 300 + 16 * 2 + 8

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
  const counts: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < total; i++) {
    const lng = flat[i * 3]
    const lat = flat[i * 3 + 1]
    const status = flat[i * 3 + 2]
    if (!inView(lng, lat)) continue
    if (status >= 0 && status <= 2) counts[status]++
    if (status === 0 && i % stride !== 0) continue
    groups[status]?.push([lng, lat])
  }
  if (total >= store.vehicleCount) statusCounts.value = counts
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
      itemStyle: { color: selected ? ACCENT : COLORS.secondary, borderColor: selected ? COLORS.accentValue : COLORS.canvas, borderWidth: selected ? 2 : 1 },
      label: {
        show: store.view === 'guangdong' || selected || (h.level === 1 && !PRD.has(h.id)),
        position: h.id === 'fs' || h.id === 'zh' ? 'left' : h.id === 'dg' || h.id === 'gz' ? 'top' : 'right',
        offset: h.id === 'fs' ? [-8, 12] : h.id === 'gz' ? [-8, -16] : h.id === 'dg' ? [16, -8] : [0, 0],
        color: selected ? COLORS.heading : h.level === 1 ? COLORS.text : COLORS.secondary,
        fontWeight: selected ? 600 : 400,
      },
    }
  })
}

// 网点抽屉打开时，地图收进抽屉左侧的剩余区域，任何网点都不会被抽屉遮挡
// 按面板宽高比铺满（避开左上面包屑）；网点抽屉打开时只占抽屉左侧的剩余区域
function geoLayout() {
  const c = chart.value
  if (!c) return { layoutCenter: ['50%', '50%'], layoutSize: '96%' }
  const w = c.getWidth(), h = c.getHeight()
  const open = !!store.selectedHub && store.hasData
  const free = open ? Math.max(w * 0.4, w - DRAWER_SPAN) : w
  const top = 44
  const bw = free * 0.94, bh = (h - top) * 0.94
  const aspect = ASPECT[store.view] ?? 1.3
  const size = aspect > 1 ? Math.min(bw, bh * aspect) : Math.min(bh, bw / aspect)
  return { layoutCenter: [free / 2, top + (h - top) / 2], layoutSize: size }
}

function clusterData() {
  return store.view === 'china' ? [{ name: '珠三角', value: [hubById.gz.lng, hubById.gz.lat] }] : []
}

// 只有选中的网点保留涟漪：动效只留给焦点，避免满屏网点同时闪动
function focusData() {
  const hub = store.selectedHub
  return motion.value && hub && inView(hub.lng, hub.lat) ? [{ name: hub.name, value: [hub.lng, hub.lat] }] : []
}

function hitData() {
  return coarse.value ? visibleHubs().map((hub) => ({ name: hub.name, hubId: hub.id, value: [hub.lng, hub.lat] })) : []
}

// 干线为 OSRM 生成的真实道路折线，按当前视图抽稀（全国约 1 公里、广东约 100 米）
function routeCoords(index: number) {
  return routeGeometry(index, store.view)
}

function eventRouteData() {
  const event = store.activeEvent
  if (!event) return []
  // 消费端防御：routeIndex 不是有效整数下标时退回按起终点查找，不让非法值导致取线路报错
  const given = event.routeIndex
  const index = typeof given === 'number' && Number.isInteger(given) && given >= 0 && given < ROUTES.length ? given
    : ROUTES.findIndex(([a, b]) => (a === event.fromId && b === event.toId) || (a === event.toId && b === event.fromId))
  return index >= 0 ? [{ coords: routeCoords(index) }] : []
}

function eventPositionData() {
  const event = store.activeEvent
  if (!event?.position || !inView(event.position[0], event.position[1])) return []
  return [{ name: event.vehicle, value: event.position }]
}

function hubTooltip(p: { data?: { name?: string; hubId?: string } }) {
  const site = p.data?.hubId ? hubById[p.data.hubId]?.site : ''
  return `网点：${p.data?.name ?? ''}${site ? ` · ${site}` : ''}（${p.data?.hubId === store.selectedHubId ? '已选中' : '点击查看详情'}）`
}

function updateSelection() {
  const c = chart.value
  if (!c) return
  c.dispatchAction({ type: 'hideTip' })
  c.setOption({ geo: geoLayout(), series: [
    { id: 'hubs', data: hubData() },
    { id: 'hub-focus', data: focusData() },
    { id: 'hub-hit', data: hitData() },
    { id: 'prd-cluster', data: clusterData() },
    { id: 'event-route', data: eventRouteData() },
    { id: 'event-position', data: eventPositionData() },
  ] })
  // 地图已让出右侧空间，抽屉固定在右侧
  store.detailSide = 'right'
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
      map: store.view === 'china' ? 'china-main' : store.view,
      roam: false,
      ...geoLayout(),
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
        lineStyle: { color: COLORS.route, width: 1.2, opacity: 0.9 },
        effect: { show: motion.value, period: 9, trailLength: 0.08, symbolSize: 2, color: COLORS.barLight },
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
        itemStyle: { color: STATUS_COLORS[s], opacity: s === 0 ? 0.8 : 0.95 },
        data: [] as [number, number][],
        silent: true,
      })),
      {
        id: 'hub-focus',
        type: 'effectScatter',
        coordinateSystem: 'geo',
        zlevel: 3,
        z: 1,
        silent: true,
        symbolSize: 18,
        rippleEffect: { brushType: 'stroke', scale: 2.6, color: ACCENT },
        itemStyle: { color: 'rgba(255, 138, 61, 0.25)' },
        data: focusData(),
      },
      {
        id: 'hubs',
        type: 'scatter',
        coordinateSystem: 'geo',
        zlevel: 3,
        z: 2,
        symbolSize: (val: unknown, params: { data?: { level?: number } }) =>
          params.data?.level === 1 ? 13 : params.data?.level === 2 ? 10 : 8,
        itemStyle: { color: COLORS.secondary },
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
        id: 'prd-cluster', type: 'scatter', coordinateSystem: 'geo', zlevel: 4,
        symbolSize: 1, itemStyle: { color: 'transparent' },
        label: {
          show: true, position: 'right', offset: [8, 22],
          formatter: '{a|珠三角}{b|  7 个网点}',
          backgroundColor: COLORS.overlay, borderColor: COLORS.border, borderWidth: 1, borderRadius: 10, padding: [3, 8],
          rich: { a: { color: COLORS.heading, fontSize: FONT.small, fontWeight: 500 }, b: { color: COLORS.tertiary, fontSize: 11 } },
        },
        emphasis: { disabled: true },
        tooltip: { formatter: '珠三角 7 个网点 · 点击下钻广东' },
        data: clusterData(),
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
        label: { show: true, formatter: '{b}', position: 'top', distance: 4, color: COLORS.heading, fontSize: 11,
          backgroundColor: 'rgba(87, 32, 29, 0.92)', borderColor: RED, borderWidth: 1, borderRadius: 3, padding: [2, 6] },
        tooltip: { formatter: (p: { name: string }) => `事件发生位置 · ${p.name}<br/>（事件发生时的位置，不是实时车辆追踪）` }, data: eventPositionData(),
      },
    ],
  }
}

async function ensureGuangdong() {
  if (gdRegistered) return
  const gd = await import('../data/guangdong')
  echarts.registerMap('guangdong', gd.default as never)
  ASPECT.guangdong = geoAspect(gd.default as unknown as Geo)
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
    await Promise.all([loadRoutes(), store.view === 'guangdong' ? ensureGuangdong() : undefined])
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
    if (params.seriesId === 'prd-cluster') {
      store.clearSelection()
      store.setView('guangdong')
    } else if (params.seriesId === 'hubs' || params.seriesId === 'hub-hit') {
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

watch(insetChart, (c) => {
  c?.setOption({
    animation: false,
    geo: {
      map: 'china', roam: false, silent: true,
      boundingCoords: [[105.5, 24.5], [121.5, 3]],
      itemStyle: { areaColor: COLORS.mapArea, borderColor: COLORS.barStrong, borderWidth: 0.8 },
      emphasis: { disabled: true }, select: { disabled: true }, label: { show: false }, tooltip: { show: false },
    },
  })
}, { flush: 'post' })

// 地图布局用的是画布像素坐标，不会随 resize 自动更新：等图表实例按新尺寸 resize 完成后再重算
onResized(() => chart.value?.setOption({ geo: geoLayout() }))

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
    <nav class="crumb" aria-label="地图范围">
      <template v-if="store.view === 'guangdong'">
        <button class="crumb-link" @click="store.clearSelection(); store.setView('china')">全国</button>
        <span class="sep">›</span><b>广东省</b>
      </template>
      <template v-else>
        <b>全国</b><span class="sep">›</span><span class="hint">点击广东省下钻</span>
      </template>
    </nav>
    <p v-if="!store.hasData" class="map-loading">{{ store.dataStatus === 'error' ? '车辆数据暂不可用' : '正在加载车辆数据…' }}</p>
    <p v-if="mapError" class="map-error" role="alert">{{ mapError }}</p>
    <figure v-show="store.view === 'china'" class="scs-inset" :class="{ shifted: !!store.selectedHub && store.hasData }" aria-label="南海诸岛示意">
      <div ref="insetEl" class="scs-chart" />
      <figcaption>南海诸岛</figcaption>
    </figure>
    <div v-if="store.hasData" class="map-legend">
      <p class="legend-title">车辆状态 · {{ store.view === 'guangdong' ? '广东省内' : '共' }} {{ fmtInt(statusCounts[0] + statusCounts[1] + statusCounts[2]) }} 台</p>
      <dl>
        <div><dt><i class="dot enroute" />在途</dt><dd>{{ fmtInt(statusCounts[0]) }}</dd></div>
        <div><dt><i class="dot dwell" />装卸</dt><dd>{{ fmtInt(statusCounts[1]) }}</dd></div>
        <div><dt><i class="dot anomaly" />异常</dt><dd>{{ fmtInt(statusCounts[2]) }}</dd></div>
      </dl>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.map-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  background: radial-gradient(ellipse at 50% 45%, #0d2142 0%, var(--color-panel) 70%);
  border: 1px solid var(--color-track);
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
.crumb {
  position: absolute;
  top: var(--space-3);
  left: var(--space-4);
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  max-width: calc(100% - 32px);
  white-space: nowrap;
  z-index: 3;
}
.crumb b { font-size: 18px; font-weight: 700; color: var(--color-heading); }
.crumb .sep { color: var(--color-tertiary); }
.crumb .hint { font-size: 13px; color: var(--color-tertiary); overflow: hidden; text-overflow: ellipsis; }
.crumb-link {
  min-height: 0;
  min-width: 0;
  padding: 0 2px;
  background: none;
  border: 0;
  color: var(--color-tertiary);
  font-size: var(--font-body);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.crumb-link:hover { color: var(--color-heading); }
.map-loading { position: absolute; top: 52px; left: var(--space-4); padding: var(--space-2); color: var(--color-secondary); background: var(--color-panel); }
.map-error { position: absolute; top: 52px; left: var(--space-4); color: var(--color-dangerText); font-size: var(--font-body); }
.scs-inset {
  position: absolute;
  right: var(--space-4);
  bottom: var(--space-4);
  width: 96px;
  height: 128px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: rgba(8, 19, 42, 0.6);
  overflow: hidden;
  pointer-events: none;
  z-index: 2;
}
/* 网点抽屉固定在右侧时，小图移到抽屉左侧 */
.scs-inset.shifted { right: calc(300px + var(--space-4) * 2 + 8px); }
.scs-chart { position: absolute; inset: 0; }
.scs-inset figcaption { position: absolute; right: 6px; bottom: 4px; font-size: 11px; color: var(--color-tertiary); }
.map-legend {
  position: absolute;
  left: var(--space-4);
  bottom: var(--space-4);
  min-width: 176px;
  max-width: calc(100% - 32px);
  padding: 10px 12px;
  background: var(--color-legend);
  border: 1px solid var(--color-track);
  border-radius: var(--radius-panel);
  font-size: var(--font-small);
  z-index: 3;
}
.legend-title { color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px; }
.map-legend dl { display: grid; gap: 4px; }
.map-legend dl > div { display: flex; align-items: center; gap: var(--space-4); }
.map-legend dt { display: flex; align-items: center; color: var(--color-secondary); }
.map-legend dd {
  margin-left: auto;
  font-family: var(--font-number);
  font-weight: 600;
  color: var(--color-heading);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.map-legend .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: var(--space-2);
}
.dot.enroute { background: var(--color-vehicle); }
.dot.dwell { background: var(--color-bar); }
.dot.anomaly { background: var(--color-danger); }
@media (max-width: 767px) {
  .map-legend { bottom: var(--space-2); left: var(--space-2); }
}
</style>
