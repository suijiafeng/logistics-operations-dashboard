<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Panel from './Panel.vue'
import OfflineTrackMap from './OfflineTrackMap.vue'
import TrackSpeedChart from './TrackSpeedChart.vue'
import WaybillEfficiencyChart from './WaybillEfficiencyChart.vue'
import { DEMO_WAYBILLS, linkedRouteName, waybillById } from '../data/deliveryTracks'
import { readAmapConfig } from '../services/amapEnv'
import { stayPlaceName } from '../services/trackMarkers'
import { analyzeTrack, efficiencyPercent, interpolateByProgress } from '../services/trackGeometry'
import { useDashboardStore } from '../stores/dashboard'

// 有 key 才去加载高德组件；加载失败再回到离线平面，避免没配 key 时仍去请求高德脚本
const AmapTrackMap = defineAsyncComponent(() => import('./AmapTrackMap.vue'))

const store = useDashboardStore()
const amapConfig = readAmapConfig()
const amapFailed = ref(false)
const amapErrorCode = ref('')
const useAmap = computed(() => amapConfig.enabled && !amapFailed.value)
const progress = ref(0)
const playing = ref(false)
/** 把几小时的运单时间压进这段墙钟，进度仍按运单时间插值，所以停留段车会停住 */
const PLAYBACK_MS = 18_000

const selected = computed(() => waybillById(store.selectedWaybillId) ?? DEMO_WAYBILLS[0]!)
const rows = computed(() => DEMO_WAYBILLS.map((waybill) => {
  const metrics = analyzeTrack(waybill.points)
  return { waybill, metrics, efficiency: efficiencyPercent(metrics.elapsedMs, waybill.promisedMs) }
}))
const current = computed(() => rows.value.find((row) => row.waybill.id === selected.value.id) ?? rows.value[0]!)
const pose = computed(() => interpolateByProgress(selected.value.points, progress.value))
const routeName = computed(() => linkedRouteName(selected.value.routeIndex))
const stayText = computed(() => {
  const stays = current.value.metrics.stays
  if (!stays.length) return '无超过 10 分钟的停留'
  return stays.map((stay) => `${stayPlaceName(selected.value.points, stay)} ${Math.round(stay.durationMs / 60_000)} 分钟`).join('、')
})

let raf = 0
let last = 0
let resumeAfterScrub = false

function stop() {
  cancelAnimationFrame(raf)
  raf = 0
  last = 0
}
function tick(now: number) {
  if (!playing.value) { stop(); return }
  if (last) {
    const dt = Math.min(100, now - last)
    progress.value = Math.min(1, progress.value + dt / PLAYBACK_MS)
    if (progress.value >= 1) { playing.value = false; stop(); return }
  }
  last = now
  raf = requestAnimationFrame(tick)
}
watch(playing, (on) => {
  if (!on) { stop(); return }
  if (progress.value >= 1) progress.value = 0
  last = 0
  raf = requestAnimationFrame(tick)
})
watch(() => store.selectedWaybillId, () => {
  playing.value = false
  progress.value = 0
})

function toggle() { playing.value = !playing.value }
function scrub(event: Event) {
  progress.value = Number((event.target as HTMLInputElement).value) / 1000
}
function holdPlayback() {
  resumeAfterScrub = playing.value
  playing.value = false
}
function releasePlayback() {
  if (resumeAfterScrub && progress.value < 1) playing.value = true
  resumeAfterScrub = false
}
function pick(id: string) { store.selectWaybill(id) }
function onAmapUnavailable(code?: string) {
  amapErrorCode.value = code && /^[A-Z0-9_]{3,40}$/.test(code) ? code : ''
  amapFailed.value = true
}

function fmtKm(meters: number) { return (meters / 1000).toFixed(1) }
function fmtKmh(value: number) { return value.toFixed(1) }
function clock(t?: number) {
  if (!t) return '—'
  return new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
}

const started = computed(() => clock(selected.value.points[0]?.t))
const ended = computed(() => clock(selected.value.points[selected.value.points.length - 1]?.t))

onMounted(() => {
  if (!import.meta.env.DEV && new URLSearchParams(location.search).get('debug') !== '1') return
  const hook = {
    get progress() { return progress.value },
    get playing() { return playing.value },
    get waybillId() { return store.selectedWaybillId },
    setProgress(value: number) { playing.value = false; progress.value = Math.min(1, Math.max(0, value)) },
    play() { playing.value = true },
    pause() { playing.value = false },
  }
  ;(window as unknown as { __delivery?: typeof hook }).__delivery = hook
})
onBeforeUnmount(() => {
  stop()
  const win = window as unknown as { __delivery?: unknown }
  if (win.__delivery) win.__delivery = undefined
})
</script>

<template>
  <div class="delivery-screen">
    <div class="top">
      <header class="bar">
        <button type="button" class="back" @click="store.closeDelivery()">返回监控</button>
        <div class="title">
          <h1>配送轨迹</h1>
          <span class="tag">演示数据</span>
          <span class="tag">GCJ-02 · 深圳 / 广州</span>
        </div>
        <span class="plate">{{ selected.plate }}</span>
      </header>
      <p v-if="!amapConfig.enabled" class="fallback-banner" role="status">未配置高德 Key，使用离线轨迹预览</p>
      <p v-else-if="amapFailed" class="fallback-banner" role="status">高德地图加载失败{{ amapErrorCode ? `（${amapErrorCode}）` : '' }}，使用离线轨迹预览</p>
      <p v-else-if="!amapConfig.securityJsCode" class="fallback-banner" role="status">未配置高德安全密钥，仅按 Key 加载</p>
    </div>

    <div class="body">
      <Panel class="list-panel" standalone title="运单" extra="演示数据 · 点选切换轨迹">
        <div class="ways">
          <div v-for="row in rows" :key="row.waybill.id" class="interactive-row way" role="button" tabindex="0"
            :class="{ selected: row.waybill.id === selected.id }" :aria-pressed="row.waybill.id === selected.id"
            @click="pick(row.waybill.id)" @keydown.enter="pick(row.waybill.id)" @keydown.space.prevent="pick(row.waybill.id)">
            <span class="no">{{ row.waybill.no }}</span>
            <span class="eff" :class="{ hot: row.waybill.id === selected.id }">{{ Math.round(row.efficiency) }}%</span>
            <span class="name">{{ row.waybill.label }}</span>
            <span class="meta">{{ fmtKm(row.metrics.distanceMeters) }} km · {{ fmtKmh(row.metrics.avgSpeedKmh) }} km/h · 停留 {{ row.metrics.stays.length }}</span>
          </div>
        </div>
      </Panel>

      <Panel class="map-panel" standalone title="配送轨迹" :extra="selected.no">
        <p class="linkage">运输效率看板已高亮本单 · 干线运量排行「{{ routeName }}」同步选中</p>
        <div class="map-host">
          <AmapTrackMap v-if="useAmap" :points="selected.points" :stays="current.metrics.stays" :pose="pose" @unavailable="onAmapUnavailable" />
          <OfflineTrackMap v-else :points="selected.points" :stays="current.metrics.stays" :pose="pose" />
        </div>
        <ul class="legend">
          <li><i class="swatch traveled" />已行驶</li>
          <li><i class="swatch track" />全程</li>
          <li><i class="dot origin" />起点</li>
          <li><i class="dot transfer" />中转 / 停留</li>
          <li><i class="dot end" />终点</li>
          <li><i class="arrow" />车辆</li>
        </ul>
        <div class="playback">
          <button type="button" :aria-pressed="playing" @click="toggle">{{ playing ? '暂停' : '播放' }}</button>
          <input type="range" min="0" max="1000" step="1" :value="Math.round(progress * 1000)"
            aria-label="轨迹回放进度" :aria-valuetext="`${clock(pose?.t)}，${Math.round(progress * 100)}%`"
            @input="scrub" @pointerdown="holdPlayback" @pointerup="releasePlayback" @pointercancel="releasePlayback">
          <span class="when">{{ clock(pose?.t) }} · {{ started }}–{{ ended }}</span>
        </div>
      </Panel>

      <Panel class="speed-panel" standalone title="速度 / 时间" extra="含停留的直线速度">
        <dl class="metrics">
          <div><dt title="折线里程，Haversine 累加，不是路网距离">里程</dt><dd>{{ fmtKm(current.metrics.distanceMeters) }} km</dd></div>
          <div><dt title="里程除以实际用时，含停留">全程均速</dt><dd>{{ fmtKmh(current.metrics.avgSpeedKmh) }} km/h</dd></div>
          <div><dt title="里程除以实际用时减停留">行驶均速</dt><dd>{{ fmtKmh(current.metrics.movingSpeedKmh) }} km/h</dd></div>
          <div><dt title="承诺用时除以实际用时">时效</dt><dd>{{ Math.round(current.efficiency) }}%</dd></div>
        </dl>
        <p class="stays">停留 {{ stayText }}</p>
        <TrackSpeedChart :points="selected.points" :stays="current.metrics.stays" />
      </Panel>
    </div>

    <Panel class="eff-panel" standalone title="运输效率" extra="承诺用时 / 实际用时 · 橙色为当前运单">
      <WaybillEfficiencyChart />
    </Panel>
  </div>
</template>

<style scoped>
.delivery-screen {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  min-height: 640px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) minmax(168px, 200px);
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-canvas);
}
.top { display: grid; gap: var(--space-2); }
.bar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 56px;
  padding: 0 var(--space-4);
  background: var(--color-header);
  border: 1px solid var(--color-track);
  border-radius: var(--radius-panel);
}
.back { padding: 0 var(--space-3); background: transparent; color: var(--color-accentText); border: 1px solid var(--color-border); border-radius: var(--radius-control); cursor: pointer; }
.title { display: flex; align-items: center; gap: var(--space-2); min-width: 0; flex: 1; }
h1 { font-size: var(--font-page); font-weight: 700; letter-spacing: 0.06em; white-space: nowrap; }
.tag, .plate {
  flex: none;
  font-size: var(--font-small);
  color: var(--color-secondary);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 0 var(--space-2);
  line-height: 20px;
}
.plate { margin-left: auto; font-family: var(--font-number); color: var(--color-heading); }
.fallback-banner {
  padding: 6px var(--space-3);
  background: var(--color-warningBg);
  color: var(--color-warning);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-control);
  font-size: var(--font-body);
}
.body {
  min-height: 0;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 340px;
  gap: var(--space-3);
}
.list-panel, .map-panel, .speed-panel, .eff-panel { height: 100%; }
.ways { flex: 1; overflow: auto; min-height: 0; display: flex; flex-direction: column; gap: 4px; }
.way {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  row-gap: 2px;
  padding: 8px;
  cursor: pointer;
}
.no, .meta { color: var(--color-tertiary); font-size: var(--font-small); }
.no, .eff, .meta { font-family: var(--font-number); }
.name { color: var(--color-text); }
.eff { color: var(--color-secondary); }
.eff.hot { color: var(--color-accentText); }
.linkage { color: var(--color-secondary); font-size: var(--font-small); margin-bottom: var(--space-2); }
.map-host { flex: 1; min-height: 0; display: flex; border-radius: var(--radius-control); overflow: hidden; border: 1px solid var(--color-track); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 12px; list-style: none; margin-top: var(--space-2); color: var(--color-tertiary); font-size: var(--font-small); }
.legend li { display: inline-flex; align-items: center; gap: 6px; }
.swatch { width: 16px; height: 3px; border-radius: 2px; }
.swatch.traveled { background: var(--color-accent); }
.swatch.track { background: var(--color-barLight); opacity: 0.7; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.origin { background: var(--color-success); }
.dot.transfer { background: var(--color-warning); }
.dot.end { background: var(--color-danger); }
.arrow { width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 9px solid var(--color-accent); }
.playback { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-2); }
.playback button { padding: 0 var(--space-3); background: var(--color-elevated); color: var(--color-heading); border: 1px solid var(--color-border); border-radius: var(--radius-control); cursor: pointer; }
.playback input { flex: 1; min-width: 0; accent-color: var(--color-accent); }
.when { flex: none; font-family: var(--font-number); font-size: var(--font-small); color: var(--color-secondary); font-variant-numeric: tabular-nums; }
.metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }
.metrics dt { color: var(--color-tertiary); font-size: var(--font-small); }
.metrics dd { color: var(--color-heading); font-family: var(--font-number); font-size: var(--font-title); font-variant-numeric: tabular-nums; }
.stays { color: var(--color-secondary); font-size: var(--font-small); margin: 6px 0; }
@media (max-width: 1279px) {
  h1 { font-size: var(--font-compactPage); }
  .body { grid-template-columns: 240px minmax(0, 1fr) 300px; }
}
@media (max-width: 1099px) {
  .delivery-screen { height: auto; min-height: 100vh; min-height: 100dvh; }
  .body { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); grid-template-rows: minmax(420px, 56vh) auto; }
  .speed-panel { grid-column: 1 / -1; min-height: 260px; }
}
@media (max-width: 767px) {
  .delivery-screen { padding: var(--space-2); gap: var(--space-2); grid-template-rows: auto auto auto; }
  .bar { min-height: 48px; gap: var(--space-2); padding-inline: var(--space-3); }
  .title .tag:last-child { display: none; }
  .body { display: flex; flex-direction: column; }
  /* 手机上轨迹和回放先于运单列表，第一屏就能看到播放和联动说明 */
  .map-panel { order: -1; min-height: 480px; }
  .map-host { min-height: 280px; }
  .speed-panel, .eff-panel { min-height: 240px; }
  .when { display: none; }
}
</style>
