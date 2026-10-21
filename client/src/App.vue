<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import TopBar from './components/TopBar.vue'
import MapChart from './components/MapChart.vue'
import HubDetail from './components/HubDetail.vue'
import TrendChart from './components/TrendChart.vue'
import ModePie from './components/ModePie.vue'
import TopHubs from './components/TopHubs.vue'
import EventStream from './components/EventStream.vue'
import PunctualityChart from './components/PunctualityChart.vue'
import WarehousePanel from './components/WarehousePanel.vue'
import RouteRank from './components/RouteRank.vue'
import Hud from './components/Hud.vue'
import { startDataFeed, stopDataFeed } from './services/socket'
import { useDashboardStore } from './stores/dashboard'
import FeedNotice from './components/FeedNotice.vue'

const store = useDashboardStore()
let freshnessTimer: number | undefined
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') store.selectHub(null)
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  const target = e.target as HTMLElement | null
  if (target?.isContentEditable || target?.closest('input, textarea, select')) return
  if (e.key.toLowerCase() === 'h') store.toggleHud()
}

onMounted(() => {
  freshnessTimer = window.setInterval(() => { store.checkedAt = Date.now() }, 1000)
  const hud = new URLSearchParams(location.search).get('hud')
  try {
    store.hudOn = hud === '1' || (hud !== '0' && localStorage.getItem('logistics-hud') === '1')
  } catch { store.hudOn = hud === '1' }
  window.addEventListener('keydown', onKey)
  startDataFeed()
  // 开发模式调试钩子：方便用无头浏览器验收下钻/网点详情等交互状态
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__dashboard = store
  }
})
onBeforeUnmount(() => {
  window.clearInterval(freshnessTimer)
  window.removeEventListener('keydown', onKey)
  stopDataFeed()
})
</script>

<template>
  <div class="viewport">
    <div class="screen" :class="{ 'motion-off': !store.decorationsOn }">
      <div class="heading">
        <TopBar />
        <FeedNotice />
      </div>
      <main class="middle">
        <div class="col left">
          <TrendChart class="grow-4" />
          <ModePie class="grow-3" />
          <TopHubs class="grow-3" />
        </div>
        <MapChart>
          <HubDetail />
          <Hud />
        </MapChart>
        <div class="col right">
          <EventStream class="grow-5" />
          <PunctualityChart class="grow-2" />
          <WarehousePanel class="grow-3" />
        </div>
      </main>
      <footer class="bottom">
        <RouteRank />
      </footer>
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
html,
body {
  min-height: 100%;
  background: var(--color-canvas);
}
body {
  font-family: var(--font-family);
  font-size: var(--font-body);
  line-height: 1.5;
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
}
button:focus-visible, [role='button']:focus-visible {
  outline: 2px solid var(--color-accentText);
  outline-offset: -2px;
}
button { font: inherit; }
button, [role='button'] { min-height: var(--control-size); }
button { min-width: var(--control-size); }
.interactive-row:hover { background: var(--color-hover); }
.interactive-row.selected { background: var(--color-selected); box-shadow: inset 2px 0 var(--color-accent); }
.motion-off *, .motion-off *::before, .motion-off *::after { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
</style>

<style scoped>
.viewport {
  min-height: 100dvh;
}
.screen {
  width: 100%;
  height: 100dvh;
  min-height: 1016px;
  background: var(--color-canvas);
  display: grid;
  grid-template-rows: auto minmax(720px, 1fr) 144px;
  gap: var(--space-4);
  padding: var(--space-4);
  position: relative;
}
.heading { display: grid; gap: var(--space-2); }
.middle {
  display: grid;
  grid-template-columns: 304px minmax(0, 1fr) 352px;
  gap: var(--space-4);
  min-height: 0;
}
.col {
  display: grid;
  gap: var(--space-4);
  min-height: 0;
  min-width: 0;
}
.left { grid-template-rows: minmax(184px, 1fr) 184px 224px; }
.right { grid-template-rows: minmax(176px, 1fr) 160px 336px; }
.bottom {
  min-height: 0;
  display: flex;
}
.bottom :deep(.panel) {
  flex: 1;
}
@media (max-width: 1599px), (max-height: 980px) {
  .screen { min-height: 900px; grid-template-rows: auto minmax(600px, 1fr) 144px; }
  .middle { grid-template-columns: 288px minmax(0, 1fr) 336px; }
  .left { grid-template-rows: minmax(184px, 1fr) 160px 224px; }
  .right { grid-template-rows: minmax(200px, 1fr) 144px 224px; }
}
@media (max-width: 1279px) {
  .screen { height: auto; grid-template-rows: auto auto 176px; }
  .middle { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .middle > :deep(.map-wrap) { grid-column: 1 / -1; grid-row: 1; min-height: 520px; }
  .col { min-height: 600px; }
}
@media (max-width: 767px) {
  .screen { padding: var(--space-2); gap: var(--space-2); grid-template-rows: auto auto auto; }
  .middle { grid-template-columns: minmax(0, 1fr); gap: var(--space-2); }
  .middle > :deep(.map-wrap) { min-height: 440px; }
  .bottom { min-height: 320px; }
}
</style>
