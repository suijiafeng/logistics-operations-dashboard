<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { useEcharts, ACCENT, RED } from '../services/useEcharts'
import { useDashboardStore } from '../stores/dashboard'
import { HUBS, ROUTES, hubById } from '../data/network'
import chinaGeo from '../assets/geo/china.json'

const store = useDashboardStore()
const { el, chart } = useEcharts()

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

const STATUS_COLORS = ['#ffb066', '#5b7a99', RED] // 在途 / 装卸 / 异常
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
  for (let i = 0; i < total; i++) {
    const lng = flat[i * 3]
    const lat = flat[i * 3 + 1]
    const status = flat[i * 3 + 2]
    if (!inView(lng, lat)) continue
    groups[status]?.push([lng, lat])
  }
  return groups
}

function renderVehicles(limit = Number.POSITIVE_INFINITY) {
  const c = chart.value
  if (!c) return
  const groups = vehicleSeriesData(limit)
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
      itemStyle: { color: selected ? '#fff2cf' : ACCENT, borderColor: selected ? ACCENT : 'transparent', borderWidth: 2 },
      label: {
        show: store.view === 'guangdong' || h.level === 1 || selected,
        position: h.id === 'fs' || h.id === 'zh' ? 'left' : h.id === 'dg' || h.id === 'gz' ? 'top' : 'right',
        offset: h.id === 'fs' ? [-8, 12] : h.id === 'gz' ? [-8, -16] : h.id === 'dg' ? [16, -8] : [0, 0],
        color: selected ? '#fff2cf' : '#c8d6e3',
      },
    }
  })
}

function baseOption() {
  const hubs = visibleHubs()
  const hubIds = new Set(hubs.map((h) => h.id))
  const lines = ROUTES.flatMap(([a, b], index) => {
    if (!hubIds.has(a) || !hubIds.has(b)) return []
    const start = hubById[a]
    const end = hubById[b]
    const bend = (index % 2 === 0 ? 1 : -1) * (0.08 + (index % 5) * 0.02)
    const cx = (start.lng + end.lng) / 2 - (end.lat - start.lat) * bend
    const cy = (start.lat + end.lat) / 2 + (end.lng - start.lng) * bend
    return [{ coords: Array.from({ length: 25 }, (_, i) => {
      const t = i / 24
      const u = 1 - t
      return [u * u * start.lng + 2 * u * t * cx + t * t * end.lng,
        u * u * start.lat + 2 * u * t * cy + t * t * end.lat]
    }) }]
  })
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#131c26',
      borderWidth: 0,
      textStyle: { color: '#d7e2ec', fontSize: 13 },
    },
    geo: {
      map: store.view,
      roam: false,
      layoutCenter: store.view === 'china' ? ['50%', '52%'] : ['50%', '50%'],
      layoutSize: store.view === 'china' ? '112%' : '96%',
      itemStyle: { areaColor: '#101a24', borderColor: '#2a3d51', borderWidth: 0.8 },
      emphasis: { disabled: true, label: { show: false } },
      select: { disabled: true },
      label: { show: false },
      tooltip: { formatter: (p: { name: string }) => store.view === 'china' && p.name === '广东省' ? '广东省 · 点击下钻' : '' },
      regions: [{ name: '广东省', itemStyle: { areaColor: '#14202c' },
        emphasis: { disabled: false, itemStyle: { areaColor: '#293423' }, label: { show: false } } }],
    },
    series: [
      {
        id: 'lines',
        type: 'lines',
        coordinateSystem: 'geo',
        zlevel: 1,
        polyline: true,
        silent: true,
        lineStyle: { color: '#39506a', width: 1, opacity: 0.4 },
        effect: { show: true, period: 9, trailLength: 0.08, symbolSize: 2, color: '#be8959' },
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
        type: 'effectScatter',
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
          color: '#c8d6e3',
          fontSize: 12,
        },
        labelLayout: { hideOverlap: true },
        emphasis: { label: { show: true } },
        tooltip: {
          formatter: (p: { data?: { name?: string } }) => `网点：${p.data?.name ?? ''}（点击查看详情）`,
        },
        data: hubData(),
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
    if (disposed || version !== buildVersion) return
    c.setOption(baseOption(), { notMerge: true })
    progressiveFeed()
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

onMounted(() => {
  echarts.registerMap('china', chinaGeo as never)
  const c = chart.value
  if (!c) return
  c.setOption(baseOption())
  c.on('click', (params) => {
    if (params.seriesId === 'hubs') {
      const hubId = (params.data as { hubId?: string })?.hubId
      if (hubId) store.selectHub(hubId)
    } else if (params.componentType === 'geo' && params.name === '广东省' && store.view === 'china') {
      store.setView('guangdong')
    } else {
      store.selectHub(null)
    }
  })
  c.getZr().on('click', (event) => {
    if (!event.target) store.selectHub(null)
  })
})

onBeforeUnmount(() => {
  disposed = true
  buildVersion++
  cancelAnimationFrame(rafId)
  window.clearTimeout(feedTimer)
  window.clearTimeout(transitionTimer)
})

watch(() => store.selectedHubId, () => {
  chart.value?.setOption({ series: [{ id: 'hubs', data: hubData() }] })
})

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
    <p v-if="mapError" class="map-error" role="alert">{{ mapError }}</p>
    <div class="map-legend">
      <span><i class="dot enroute" />在途</span>
      <span><i class="dot dwell" />装卸</span>
      <span><i class="dot anomaly" />异常</span>
      <span class="hint">{{ store.view === 'china' ? '点击广东省下钻 · 点击网点看详情' : '广东省内网点与车辆' }}</span>
    </div>
    <button v-if="store.view === 'guangdong'" class="back-btn" @click="store.setView('china')">返回全国</button>
    <slot />
  </div>
</template>

<style scoped>
.map-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  background: #0d141b;
  border-radius: 6px;
  overflow: hidden;
}
.map-chart {
  position: absolute;
  inset: 0;
  transition: opacity 0.2s ease;
}
.map-chart.switching { opacity: 0.25; }
.map-error { position: absolute; top: 16px; left: 150px; color: #ff9d97; font-size: 13px; }
.map-legend {
  position: absolute;
  left: 14px;
  bottom: 12px;
  display: flex;
  gap: 14px;
  align-items: center;
  font-size: 12px;
  color: #7e93a8;
  background: rgba(10, 15, 20, 0.82);
  padding: 5px 10px;
  border-radius: 4px;
}
.map-legend .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 5px;
}
.dot.enroute { background: #ffb066; }
.dot.dwell { background: #5b7a99; }
.dot.anomaly { background: #f0524d; }
.map-legend .hint {
  color: #8fa3b8;
}
.back-btn {
  position: absolute;
  top: 12px;
  left: 14px;
  background: #ff8a3d;
  color: #131313;
  border: none;
  border-radius: 4px;
  padding: 5px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
</style>
