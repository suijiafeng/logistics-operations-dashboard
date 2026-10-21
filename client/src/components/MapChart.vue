<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import echarts from '../services/echarts'
import { useEcharts, ACCENT, RED, TOOLTIP, TEXT } from '../services/useEcharts'
import { COLORS, FONT } from '../design/tokens'
import { useChartMotion } from '../services/useChartMotion'
import { useMediaQuery } from '../services/useMediaQuery'
import { useDashboardStore, LAYER_KEYS, type LayerKey } from '../stores/dashboard'
import { useFocus } from '../services/useFocus'
import { fmtInt } from '../services/format'
import { HUBS, ROUTES, hubById, hubsInProvince } from '../data/network'
import { provinceByName } from '../data/provinces'
import { routeCoords as routeGeometry, loadRoutes } from '../services/geo'
import { loadRegion, geoAspect, type Region, type Geo } from '../services/region'
import { plateOf, indexOfPlate } from '../services/vehicles'
import chinaGeo from '../assets/geo/china.json'

const store = useDashboardStore()
const { el, chart, onResized } = useEcharts()
// 南海诸岛小图：独立实例，容器裁掉框外部分，只显示南海范围
const { el: insetEl, chart: insetChart } = useEcharts()
const { focusVehicle } = useFocus()
const motion = useChartMotion()
const coarse = useMediaQuery('(pointer: coarse)')
echarts.registerMap('china', chinaGeo as never)

// 主图只保留大陆与海南本岛：九段线和南海诸岛（北纬 18° 以南）让纬度跨度从约 50° 增加到 35°，
// 会把全国图压小；它们改由右下角的南海诸岛小图展示
const SCS_LAT = 18
function maxLat(poly: number[][][]) { let m = -90; for (const ring of poly) for (const p of ring) m = Math.max(m, p[1]!); return m }
const chinaMain = {
  ...(chinaGeo as unknown as Geo),
  features: (chinaGeo as unknown as Geo).features
    .filter((f) => !String(f.properties.adcode).includes('JD'))
    .map((f) => f.properties.name !== '海南省' || f.geometry.type !== 'MultiPolygon' ? f
      : { ...f, geometry: { ...f.geometry, coordinates: f.geometry.coordinates.filter((poly) => maxLat(poly) >= SCS_LAT) } }),
}
echarts.registerMap('china-main', chinaMain as never)
const ASPECT: Record<string, number> = { china: geoAspect(chinaMain) }
// 珠三角 7 个网点在全国视图里挤在一起：名字收进一个聚合标签，点击下钻广东
const PRD = new Set(['gz', 'sz', 'dg', 'fs', 'zh', 'zs', 'hz'])
const GUANGDONG = '440000'

/** 当前省级区域（全国视图为 undefined） */
let region: Region | undefined
let rafPending = false
let rafId = 0
let feedTimer: number | undefined
let transitionTimer: number | undefined
let buildVersion = 0
let disposed = false
const switching = ref(false)
// 图例计数：统计当前视图内全部车辆（不受画质抽稀和图层开关影响）
const statusCounts = ref<[number, number, number]>([0, 0, 0])
const mapError = ref('')
const query = ref('')
let fedCount = 0 // 首屏分片渐进：已喂入的车辆数

const STATUS_COLORS = [COLORS.vehicle, COLORS.bar, RED] // 在途 / 装卸 / 异常
const STATUS_SIZES = [4, 4, 6]
const STATUS_LAYER: LayerKey[] = ['enroute', 'dwell', 'anomaly']
const STATUS_TEXT = ['在途', '装卸', '异常']
const DRAWER_SPAN = 300 + 16 * 2 + 8

const LAYER_ROWS: { key: LayerKey; label: string; dot: string }[] = [
  { key: 'enroute', label: '在途', dot: 'enroute' },
  { key: 'dwell', label: '装卸', dot: 'dwell' },
  { key: 'anomaly', label: '异常', dot: 'anomaly' },
  { key: 'routes', label: '干线', dot: 'route' },
  { key: 'hubs', label: '网点', dot: 'hub' },
]
const legendTotal = computed(() => statusCounts.value[0] + statusCounts.value[1] + statusCounts.value[2])
const drawerOpen = computed(() => store.hasData && (!!store.selectedHub || !!store.selectedPlate))

function inView(lng: number, lat: number) {
  if (store.view === 'china') return true
  return region?.adcode === store.view ? region.contains(lng, lat) : false
}

function visibleHubs() {
  return HUBS.filter((h) => inView(h.lng, h.lat))
}

/** 把扁平车辆数组按状态拆成三组散点数据（只取前 limit 台做分片渐进）；数据项第三位为车辆下标，点击时换算车牌 */
function vehicleSeriesData(limit: number) {
  const groups: [number, number, number][][] = [[], [], []]
  const flat = store.vehicles
  const total = Math.min(limit, store.vehicleCount, Math.floor(flat.length / 3))
  const budget = store.quality === 'full' ? total : store.quality === 'balanced' ? 6000 : 3000
  const stride = Math.max(1, Math.ceil(total / budget))
  const counts: [number, number, number] = [0, 0, 0]
  const on = STATUS_LAYER.map((key) => store.layers[key])
  for (let i = 0; i < total; i++) {
    const lng = flat[i * 3]!
    const lat = flat[i * 3 + 1]!
    const status = flat[i * 3 + 2]!
    if (!inView(lng, lat)) continue
    if (status >= 0 && status <= 2) counts[status as 0 | 1 | 2]++
    if (!on[status]) continue
    if (status === 0 && i % stride !== 0) continue
    groups[status]?.push([lng, lat, i])
  }
  if (total >= store.vehicleCount) statusCounts.value = counts
  return groups
}

function renderVehicles(limit = Number.POSITIVE_INFINITY) {
  const c = chart.value
  if (!c) return
  const groups = vehicleSeriesData(limit)
  store.renderedVehicles = groups.reduce((sum, group) => sum + group.length, 0)
  // 增量更新：只替换三组车辆散点与追踪标记的数据，不重建整个 option
  c.setOption({
    series: [...groups.map((data, s) => ({ id: `veh-${s}`, data })), { id: 'vehicle-focus', data: vehicleFocusData() }],
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
    fedCount = steps[idx++]!
    renderVehicles(fedCount)
    if (idx < steps.length) feedTimer = window.setTimeout(next, 160)
  }
  next()
}

function hubData() {
  if (!store.layers.hubs) return []
  return visibleHubs().map((h) => {
    const selected = h.id === store.selectedHubId
    return {
      name: h.name, hubId: h.id, level: h.level, value: [h.lng, h.lat],
      symbolSize: selected ? 18 : h.level === 1 ? 13 : h.level === 2 ? 10 : 8,
      itemStyle: { color: selected ? ACCENT : COLORS.secondary, borderColor: selected ? COLORS.accentValue : COLORS.canvas, borderWidth: selected ? 2 : 1 },
      label: {
        show: store.view !== 'china' || selected || (h.level === 1 && !PRD.has(h.id)),
        position: h.id === 'fs' || h.id === 'zh' ? 'left' : h.id === 'dg' || h.id === 'gz' ? 'top' : 'right',
        offset: h.id === 'fs' ? [-8, 12] : h.id === 'gz' ? [-8, -16] : h.id === 'dg' ? [16, -8] : [0, 0],
        color: selected ? COLORS.heading : h.level === 1 ? COLORS.text : COLORS.secondary,
        fontWeight: selected ? 600 : 400,
      },
    }
  })
}

// 按面板宽高比铺满（避开左上面包屑）；网点 / 车辆抽屉打开时只占抽屉左侧的剩余区域
function geoLayout() {
  const c = chart.value
  if (!c) return { layoutCenter: ['50%', '50%'], layoutSize: '96%' }
  const w = c.getWidth(), h = c.getHeight()
  const free = drawerOpen.value ? Math.max(w * 0.4, w - DRAWER_SPAN) : w
  const top = 44
  const bw = free * 0.94, bh = (h - top) * 0.94
  const aspect = ASPECT[store.view] ?? 1.3
  const size = aspect > 1 ? Math.min(bw, bh * aspect) : Math.min(bh, bw / aspect)
  return { layoutCenter: [free / 2, top + (h - top) / 2], layoutSize: size }
}

function clusterData() {
  return store.view === 'china' && store.layers.hubs ? [{ name: '珠三角', value: [hubById.gz!.lng, hubById.gz!.lat] }] : []
}

// 只有选中的网点保留涟漪：动效只留给焦点，避免满屏网点同时闪动
function focusData() {
  const hub = store.selectedHub
  return motion.value && hub && inView(hub.lng, hub.lat) ? [{ name: hub.name, value: [hub.lng, hub.lat] }] : []
}

function hitData() {
  return coarse.value && store.layers.hubs ? visibleHubs().map((hub) => ({ name: hub.name, hubId: hub.id, value: [hub.lng, hub.lat] })) : []
}

// 干线为 OSRM 生成的真实道路折线，按当前视图抽稀（全国约 1 公里、省级约 100 米）
function routeCoords(index: number) {
  return routeGeometry(index, store.view)
}

/** 当前视图内的干线：全国全部；省级取两端在省内或折线穿过本省的线路（每 8 个点抽查一次） */
const routeViewCache = new Map<string, number[]>()
function routesInView() {
  if (store.view === 'china') return ROUTES.map((_, i) => i)
  const key = `${store.view}:${region?.adcode ?? ''}`
  let list = routeViewCache.get(key)
  if (!list) {
    list = ROUTES.flatMap(([a, b], index) => {
      const ha = hubById[a]!, hb = hubById[b]!
      if (inView(ha.lng, ha.lat) || inView(hb.lng, hb.lat)) return [index]
      const coords = routeCoords(index)
      for (let i = 0; i < coords.length; i += 8) if (inView(coords[i]![0], coords[i]![1])) return [index]
      return []
    })
    routeViewCache.set(key, list)
  }
  return list
}

function linesData() {
  return store.layers.routes ? routesInView().map((index) => ({ coords: routeCoords(index) })) : []
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

/** 选中车辆的当前位置：优先用 1Hz 增量包里该下标的坐标，详情尚未到达时用详情接口的位置 */
function vehiclePosition(): [number, number, number] | undefined {
  const plate = store.selectedPlate
  if (!plate) return undefined
  const index = indexOfPlate(plate, store.vehicleCount)
  if (index >= 0 && store.vehicles.length >= (index + 1) * 3) {
    return [store.vehicles[index * 3]!, store.vehicles[index * 3 + 1]!, store.vehicles[index * 3 + 2]!]
  }
  const d = store.vehicle
  return d ? [d.position[0], d.position[1], d.status] : undefined
}

function vehicleFocusData() {
  const pos = vehiclePosition()
  if (!pos || !inView(pos[0], pos[1])) return []
  const status = pos[2]
  return [{
    name: store.selectedPlate, value: [pos[0], pos[1]],
    // ECharts 的 symbolRotate 为逆时针角度，朝向为顺时针方位角
    symbolRotate: -(store.vehicle?.heading ?? 0),
    itemStyle: { color: status === 2 ? RED : ACCENT },
  }]
}

function vehicleRouteData() {
  const d = store.vehicle
  if (!d || !store.selectedPlate) return []
  return Number.isInteger(d.routeIndex) && d.routeIndex >= 0 && d.routeIndex < ROUTES.length ? [{ coords: routeCoords(d.routeIndex) }] : []
}

function hubTooltip(p: { data?: { name?: string; hubId?: string } }) {
  const site = p.data?.hubId ? hubById[p.data.hubId]?.site : ''
  return `网点：${p.data?.name ?? ''}${site ? ` · ${site}` : ''}（${p.data?.hubId === store.selectedHubId ? '已选中' : '点击查看详情'}）`
}

function vehicleTooltip(p: { seriesId?: string; data?: number[] }) {
  const index = p.data?.[2]
  const status = Number(p.seriesId?.split('-')[1])
  return typeof index === 'number' ? `${plateOf(index)} · ${STATUS_TEXT[status] ?? ''}<br/>点击查看车辆详情` : ''
}

function geoTooltip(p: { name: string }) {
  if (store.view !== 'china') return p.name
  const province = provinceByName(p.name)
  const count = province ? hubsInProvince(province.adcode).length : 0
  return `${p.name}${count ? ` · ${count} 个网点` : ''} · 点击下钻`
}

function updateSelection() {
  const c = chart.value
  if (!c) return
  c.dispatchAction({ type: 'hideTip' })
  c.setOption({ geo: geoLayout(), series: [
    { id: 'lines', data: linesData() },
    { id: 'hubs', data: hubData() },
    { id: 'hub-focus', data: focusData() },
    { id: 'hub-hit', data: hitData() },
    { id: 'prd-cluster', data: clusterData() },
    { id: 'event-route', data: eventRouteData() },
    { id: 'event-position', data: eventPositionData() },
    { id: 'vehicle-route', data: vehicleRouteData() },
    { id: 'vehicle-focus', data: vehicleFocusData() },
  ] })
  // 地图已让出右侧空间，抽屉固定在右侧
  store.detailSide = 'right'
}

function baseOption() {
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
      // 全国视图任意省份可悬停下钻；省级视图显示地级市面，仅作悬停提示
      emphasis: { disabled: false, itemStyle: { areaColor: COLORS.mapHover }, label: { show: false } },
      select: { disabled: true },
      label: { show: false },
      tooltip: { formatter: geoTooltip },
      regions: store.view === 'china' ? [{ name: '广东省', itemStyle: { areaColor: COLORS.mapProvince } }] : [],
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
        data: linesData(),
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
        emphasis: { disabled: true },
        tooltip: { formatter: vehicleTooltip },
        data: [] as [number, number, number][],
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
      {
        // 追踪车辆所在干线：橙色高亮，其余线路淡出
        id: 'vehicle-route', type: 'lines', coordinateSystem: 'geo', zlevel: 5,
        polyline: true, silent: true, lineStyle: { color: ACCENT, width: 2.5, opacity: 0.9 },
        data: vehicleRouteData(),
      },
      {
        // 追踪车辆：箭头按行驶朝向旋转，位置每秒随增量包更新
        id: 'vehicle-focus', type: 'effectScatter', coordinateSystem: 'geo', zlevel: 6,
        symbol: 'arrow', symbolSize: 18, rippleEffect: { brushType: 'stroke', scale: 2.4, color: ACCENT },
        itemStyle: { color: ACCENT, borderColor: COLORS.canvas, borderWidth: 1 },
        label: { show: true, formatter: '{b}', position: 'top', distance: 8, color: COLORS.heading, fontSize: 11,
          backgroundColor: COLORS.overlay, borderColor: ACCENT, borderWidth: 1, borderRadius: 3, padding: [2, 6] },
        emphasis: { disabled: true },
        tooltip: { formatter: (p: { name: string }) => `追踪中 · ${p.name}` },
        data: vehicleFocusData(),
      },
    ],
  }
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
    const view = store.view
    const [, loaded] = await Promise.all([loadRoutes(), view === 'china' ? undefined : loadRegion(view)])
    if (disposed || version !== buildVersion || chart.value !== c) return
    region = loaded
    if (loaded) ASPECT[view] = loaded.aspect
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

function drillTo(adcode: string) {
  store.clearSelection()
  store.setView(adcode)
}

/** 空白处点击：在鼠标附近 10 像素内找最近的车辆（large 模式散点不一定命中），找不到则清除选择 */
function pickVehicle(x: number, y: number) {
  const c = chart.value
  if (!c || !store.hasData) return false
  const origin = c.convertFromPixel({ geoIndex: 0 }, [x, y]) as [number, number] | undefined
  const dx = c.convertFromPixel({ geoIndex: 0 }, [x + 10, y]) as [number, number] | undefined
  const dy = c.convertFromPixel({ geoIndex: 0 }, [x, y + 10]) as [number, number] | undefined
  if (!origin || !dx || !dy) return false
  const tolLng = Math.abs(dx[0] - origin[0]), tolLat = Math.abs(dy[1] - origin[1])
  if (!tolLng || !tolLat) return false
  const flat = store.vehicles
  const on = STATUS_LAYER.map((key) => store.layers[key])
  let best = -1, bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < store.vehicleCount; i++) {
    const status = flat[i * 3 + 2]!
    if (!on[status]) continue
    const u = (flat[i * 3]! - origin[0]) / tolLng, v = (flat[i * 3 + 1]! - origin[1]) / tolLat
    if (u > 1 || u < -1 || v > 1 || v < -1) continue
    const dist = u * u + v * v
    if (dist < bestDist && inView(flat[i * 3]!, flat[i * 3 + 1]!)) { bestDist = dist; best = i }
  }
  if (best < 0) return false
  focusVehicle(plateOf(best))
  return true
}

function search() {
  const index = indexOfPlate(query.value, store.vehicleCount)
  if (index < 0) { store.notify(`未找到车辆：${query.value.trim() || '请输入车牌'}（车牌格式 粤A·10000）`); return }
  focusVehicle(plateOf(index))
  query.value = ''
}

function toggleLayer(key: LayerKey) {
  store.setLayer(key, !store.layers[key])
}

watch(chart, (c) => {
  if (!c) return
  void rebuildMap()
  // ECharts 的图表点击先于下面的 zrender 点击触发：网点 / 省份 / 聚合标签等命中后标记已处理，
  // 其余情况（省级视图的地级市面、静默的干线折线、空白处）交给 zrender 点击做车辆就近拾取
  let consumed = false
  c.on('click', (params) => {
    c.dispatchAction({ type: 'hideTip' })
    const seriesId = params.seriesId ?? ''
    if (seriesId === 'prd-cluster') {
      drillTo(GUANGDONG)
      consumed = true
    } else if (seriesId === 'hubs' || seriesId === 'hub-hit') {
      const hubId = (params.data as { hubId?: string })?.hubId
      if (hubId) { store.selectHub(hubId); consumed = true }
    } else if (seriesId.startsWith('veh-')) {
      const index = (params.data as number[] | undefined)?.[2]
      if (typeof index === 'number') { focusVehicle(plateOf(index)); consumed = true }
    } else if (params.componentType === 'geo' && store.view === 'china') {
      const province = provinceByName(params.name)
      if (province) { drillTo(province.adcode); consumed = true }
    } else if (seriesId === 'event-position' || seriesId === 'vehicle-focus') {
      consumed = true
    }
  })
  c.getZr().on('click', (event) => {
    if (consumed) { consumed = false; return }
    if (!pickVehicle(event.offsetX, event.offsetY)) store.clearSelection()
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

watch([() => store.selectedHubId, () => store.activeEvent, () => store.selectedPlate, () => store.vehicle, coarse], updateSelection)
watch(() => store.layers, () => { updateSelection(); scheduleVehicleRender() }, { deep: true })
watch(motion, () => { void rebuildMap() })
watch(() => store.quality, scheduleVehicleRender)

// 追踪的车辆不在当前省内（检索到外省车辆、车辆驶出本省）时回到全国视图
watch(() => [store.selectedPlate, store.vehicle, store.mapVersion] as const, () => {
  const pos = vehiclePosition()
  if (pos && store.view !== 'china' && region?.adcode === store.view && !inView(pos[0], pos[1])) {
    const name = store.viewName
    store.setView('china')
    store.notify(`${store.selectedPlate} 不在${name}内，已切换全国视图`)
  }
})

// 视图切换（全国 ↔ 省级下钻）时整图重建
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
      <template v-if="store.view !== 'china'">
        <button class="crumb-link" @click="drillTo('china')">全国</button>
        <span class="sep">›</span><b>{{ store.viewName }}</b>
      </template>
      <template v-else>
        <b>全国</b><span class="sep">›</span><span class="hint">点击任意省份下钻</span>
      </template>
    </nav>
    <form class="search" role="search" :class="{ shifted: drawerOpen }" @submit.prevent="search">
      <input v-model="query" type="search" name="plate" placeholder="车牌检索 粤A·10000" aria-label="按车牌检索车辆" autocomplete="off" spellcheck="false" />
      <button type="submit" aria-label="检索">⌕</button>
    </form>
    <p v-if="!store.hasData" class="map-loading">{{ store.dataStatus === 'error' ? '车辆数据暂不可用' : '正在加载车辆数据…' }}</p>
    <p v-if="mapError" class="map-error" role="alert">{{ mapError }}</p>
    <figure v-show="store.view === 'china'" class="scs-inset" :class="{ shifted: drawerOpen }" aria-label="南海诸岛示意">
      <div ref="insetEl" class="scs-chart" />
      <figcaption>南海诸岛</figcaption>
    </figure>
    <div v-if="store.hasData" class="map-legend" role="group" aria-label="图层开关">
      <p class="legend-title">{{ store.view === 'china' ? '共' : `${store.viewName}内` }} {{ fmtInt(legendTotal) }} 台 · 点击切换图层</p>
      <ul>
        <li v-for="row in LAYER_ROWS" :key="row.key">
          <button type="button" class="layer" :class="{ off: !store.layers[row.key] }" :aria-pressed="store.layers[row.key]"
            :title="`${store.layers[row.key] ? '隐藏' : '显示'}${row.label}图层`" @click="toggleLayer(row.key)">
            <i class="dot" :class="row.dot" /><span class="name">{{ row.label }}</span>
            <b v-if="row.key === 'enroute'">{{ fmtInt(statusCounts[0]) }}</b>
            <b v-else-if="row.key === 'dwell'">{{ fmtInt(statusCounts[1]) }}</b>
            <b v-else-if="row.key === 'anomaly'">{{ fmtInt(statusCounts[2]) }}</b>
            <b v-else-if="row.key === 'routes'">{{ routesInView().length }} 条</b>
            <b v-else>{{ visibleHubs().length }} 个</b>
          </button>
        </li>
      </ul>
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
  max-width: calc(100% - 260px);
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
/* 车牌检索：右上角，抽屉打开时移到抽屉左侧 */
.search {
  position: absolute;
  top: var(--space-3);
  right: var(--space-4);
  display: flex;
  width: 208px;
  max-width: calc(100% - 32px);
  background: var(--color-legend);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  z-index: 3;
}
.search.shifted { right: calc(300px + var(--space-4) * 2 + 8px); }
.search input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  background: transparent;
  border: 0;
  color: var(--color-heading);
  font: inherit;
  font-size: var(--font-small);
}
.search input::placeholder { color: var(--color-tertiary); }
.search input:focus-visible { outline: 2px solid var(--color-barLight); outline-offset: -2px; border-radius: var(--radius-control); }
.search input::-webkit-search-cancel-button { filter: invert(0.7); }
.search button { min-height: 30px; min-width: 32px; padding: 0; background: transparent; border: 0; border-left: 1px solid var(--color-track); color: var(--color-secondary); font-size: 16px; cursor: pointer; }
.search button:hover { color: var(--color-heading); background: var(--color-hover); }
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
  padding: 8px 6px 6px;
  background: var(--color-legend);
  border: 1px solid var(--color-track);
  border-radius: var(--radius-panel);
  font-size: var(--font-small);
  z-index: 3;
}
.legend-title { padding: 0 6px; color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
.map-legend ul { list-style: none; display: grid; }
.layer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 26px;
  padding: 0 6px;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--color-secondary);
  font-size: var(--font-small);
  text-align: left;
  cursor: pointer;
}
.layer:hover { background: var(--color-hover); color: var(--color-heading); }
.layer .name { flex: 1; }
.layer b {
  font-family: var(--font-number);
  font-weight: 600;
  color: var(--color-heading);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.layer.off { color: var(--color-tertiary); text-decoration: line-through; }
.layer.off b { color: var(--color-tertiary); font-weight: 400; }
.layer.off .dot { opacity: 0.3; }
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.dot.enroute { background: var(--color-vehicle); }
.dot.dwell { background: var(--color-bar); }
.dot.anomaly { background: var(--color-danger); }
.dot.route { width: 12px; height: 2px; border-radius: 1px; background: var(--color-barLight); }
.dot.hub { background: var(--color-secondary); border: 1px solid var(--color-heading); }
@media (max-width: 767px) {
  .map-legend { bottom: var(--space-2); left: var(--space-2); }
  .search { width: 160px; }
  .crumb { max-width: calc(100% - 190px); }
}
</style>
