<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { fetchHistoryIndex, fetchHistoryFrame } from '../services/history'

// 回放时间轴：引擎每 10 秒一帧、保留 1 小时。打开后地图改画历史帧，实时数据继续在后台更新，退出即回到实时。
// 帧按需拉取并缓存（每帧约 300 KB，gzip 约 100 KB），播放时预取下一帧；帧列表每 30 秒刷新一次纳入新帧。
const SPEEDS = [
  { fps: 1, label: '10×' },
  { fps: 3, label: '30×' },
  { fps: 6, label: '60×' },
]
const store = useDashboardStore()
const pb = computed(() => store.playback)
const cache = new Map<number, { vehicles: number[]; kpi: { enRoute: number; pendingAnomalies: number } }>()
const MAX_CACHE = 120
let playTimer: number | undefined
let refreshTimer: number | undefined
let loadToken = 0
let controller: AbortController | undefined

const frameTime = computed(() => pb.value.frameTs ? fmtTime(pb.value.frameTs) : '—')
const rangeLabel = computed(() => {
  const frames = pb.value.frames
  return frames.length ? `${fmtTime(frames[0]!)} – ${fmtTime(frames[frames.length - 1]!)}` : '暂无历史帧'
})
const behind = computed(() => {
  const frames = pb.value.frames
  if (!frames.length || !pb.value.frameTs) return ''
  const sec = Math.round((frames[frames.length - 1]! - pb.value.frameTs) / 1000)
  return sec > 0 ? `落后实时 ${sec >= 60 ? `${Math.floor(sec / 60)} 分 ${sec % 60} 秒` : `${sec} 秒`}` : '最新一帧'
})

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
}

async function refreshIndex() {
  try {
    const index = await fetchHistoryIndex()
    const wasAtEnd = pb.value.index >= pb.value.frames.length - 1
    store.playback.frames = index.frames
    store.playback.interval = index.interval
    if (!index.frames.length) { store.playback.error = '引擎尚未积累历史帧'; return }
    store.playback.error = ''
    if (wasAtEnd && !pb.value.playing) seek(index.frames.length - 1)
    else if (pb.value.index >= index.frames.length) seek(index.frames.length - 1)
  } catch (error) {
    store.playback.error = `历史帧列表加载失败：${(error as Error).message}`
  }
}

async function loadFrame(ts: number, prefetch = false) {
  const cached = cache.get(ts)
  if (cached) { if (!prefetch) store.applyPlaybackFrame(ts, cached.vehicles, cached.kpi); return }
  const token = prefetch ? loadToken : ++loadToken
  if (!prefetch) { controller?.abort(); controller = new AbortController(); store.playback.loading = true }
  try {
    const frame = await fetchHistoryFrame(ts, prefetch ? undefined : controller?.signal)
    cache.set(ts, { vehicles: frame.vehicles, kpi: frame.kpi })
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!)
    if (!prefetch && token === loadToken && pb.value.on) { store.applyPlaybackFrame(ts, frame.vehicles, frame.kpi); store.playback.error = '' }
  } catch (error) {
    if ((error as Error).name === 'AbortError') return
    if (!prefetch) store.playback.error = `历史帧加载失败：${(error as Error).message}`
  } finally {
    if (!prefetch && token === loadToken) store.playback.loading = false
  }
}

function seek(index: number) {
  const frames = pb.value.frames
  if (!frames.length) return
  const next = Math.max(0, Math.min(frames.length - 1, Math.round(index)))
  store.playback.index = next
  void loadFrame(frames[next]!)
  if (next + 1 < frames.length) void loadFrame(frames[next + 1]!, true)
}

function stopPlaying() {
  window.clearInterval(playTimer)
  playTimer = undefined
  store.playback.playing = false
}

function startPlaying() {
  if (!pb.value.frames.length) return
  if (pb.value.index >= pb.value.frames.length - 1) seek(0)
  store.playback.playing = true
  window.clearInterval(playTimer)
  playTimer = window.setInterval(() => {
    if (pb.value.loading) return
    if (pb.value.index >= pb.value.frames.length - 1) { stopPlaying(); return }
    seek(pb.value.index + 1)
  }, 1000 / pb.value.fps)
}

function togglePlay() { if (pb.value.playing) stopPlaying(); else startPlaying() }
function setSpeed(event: Event) {
  store.playback.fps = Number((event.target as HTMLSelectElement).value) || 3
  if (pb.value.playing) startPlaying()
}
function onRange(event: Event) { stopPlaying(); seek(Number((event.target as HTMLInputElement).value)) }
function open() { store.setPlayback(true) }
function close() { store.setPlayback(false) }
function onKey(event: KeyboardEvent) {
  if (event.key === ' ') { event.preventDefault(); togglePlay() }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); stopPlaying(); seek(pb.value.index - 1) }
  else if (event.key === 'ArrowRight') { event.preventDefault(); stopPlaying(); seek(pb.value.index + 1) }
}

watch(() => pb.value.on, (on) => {
  stopPlaying()
  window.clearInterval(refreshTimer)
  controller?.abort()
  if (!on) return
  void refreshIndex()
  refreshTimer = window.setInterval(() => { if (!document.hidden) void refreshIndex() }, 30_000)
})
// 引擎重启后历史帧全部失效
watch(() => store.engineId, () => { cache.clear(); if (pb.value.on) void refreshIndex() })
onBeforeUnmount(() => { stopPlaying(); window.clearInterval(refreshTimer); controller?.abort() })
</script>

<template>
  <div v-if="store.hasData" class="timeline" :class="{ open: pb.on }" @keydown="pb.on && onKey($event)">
    <button v-if="!pb.on" type="button" class="opener" title="回放最近 1 小时车辆位置（10 秒一帧）" @click="open">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 1 1-5.2 7.2" /><path d="M2.5 5.5V9.7h4.2" /><path d="M8 5v3.3l2.2 1.3" /></svg>
      回放
    </button>
    <template v-else>
      <button type="button" class="live" title="退出回放，回到实时" @click="close">● 回到实时</button>
      <button type="button" class="play" :aria-label="pb.playing ? '暂停' : '播放'" :disabled="!pb.frames.length" @click="togglePlay">{{ pb.playing ? '❚❚' : '▶' }}</button>
      <div class="track">
        <input type="range" min="0" :max="Math.max(0, pb.frames.length - 1)" step="1" :value="pb.index" :disabled="!pb.frames.length"
          aria-label="回放进度" :aria-valuetext="frameTime" @input="onRange" />
        <div class="labels"><span>{{ rangeLabel }}</span><span class="status" :class="{ err: pb.error }">{{ pb.error || behind }}</span></div>
      </div>
      <div class="now" :class="{ loading: pb.loading }"><b>{{ frameTime }}</b><small>回放 · 10 秒/帧</small></div>
      <label class="speed">速度
        <select :value="pb.fps" @change="setSpeed"><option v-for="s in SPEEDS" :key="s.fps" :value="s.fps">{{ s.label }}</option></select>
      </label>
    </template>
  </div>
</template>

<style scoped>
/* 底部居中：左侧让出图例（约 200px + 边距），右侧让出南海小图 */
.timeline {
  position: absolute;
  left: 240px;
  right: 128px;
  bottom: var(--space-4);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  z-index: 4;
  pointer-events: none;
}
.timeline > * { pointer-events: auto; }
.timeline.open {
  padding: 8px 12px;
  background: var(--color-legend);
  border: 1px solid var(--color-track);
  border-radius: var(--radius-panel);
}
.opener, .live, .play {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-legend);
  color: var(--color-secondary);
  font-size: var(--font-small);
  cursor: pointer;
}
.opener:hover, .live:hover, .play:hover { color: var(--color-heading); background: var(--color-hover); }
.opener svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.live { background: transparent; color: var(--color-accentText); border-color: var(--color-accent); }
.play { min-width: 36px; justify-content: center; font-size: 11px; background: transparent; }
.play:disabled { opacity: 0.5; cursor: default; }
.track { flex: 1; min-width: 120px; display: grid; gap: 2px; }
.track input[type='range'] { width: 100%; height: 18px; margin: 0; accent-color: var(--color-accent); cursor: pointer; }
.labels { display: flex; justify-content: space-between; gap: var(--space-2); font-family: var(--font-number); font-size: 11px; color: var(--color-tertiary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.labels .status { overflow: hidden; text-overflow: ellipsis; }
.labels .status.err { color: var(--color-dangerText); }
.now { display: grid; justify-items: end; min-width: 84px; }
.now b { font-family: var(--font-number); font-size: 16px; color: var(--color-accentText); font-variant-numeric: tabular-nums; }
.now.loading b { opacity: 0.5; }
.now small { font-size: 11px; color: var(--color-tertiary); white-space: nowrap; }
.speed { display: flex; align-items: center; gap: 6px; font-size: var(--font-small); color: var(--color-secondary); white-space: nowrap; }
.speed select { min-height: 28px; padding: 0 6px; background: var(--color-canvas); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius-control); font: inherit; font-size: var(--font-small); }
/* 窄屏：地图宽度不够与图例并排，时间轴移到图例上方 */
@media (max-width: 1279px) {
  .timeline { left: var(--space-4); right: var(--space-4); bottom: 212px; }
  .speed { display: none; }
}
</style>
