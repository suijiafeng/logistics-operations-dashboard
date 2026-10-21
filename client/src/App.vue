<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import TopBar from './components/TopBar.vue'
import MapChart from './components/MapChart.vue'
import HubDetail from './components/HubDetail.vue'
import TrendChart from './components/TrendChart.vue'
import KpiOverview from './components/KpiOverview.vue'
import TopHubs from './components/TopHubs.vue'
import EventStream from './components/EventStream.vue'
import WarehousePanel from './components/WarehousePanel.vue'
import RouteRank from './components/RouteRank.vue'
import Hud from './components/Hud.vue'
import { startDataFeed, stopDataFeed } from './services/socket'
import { useDashboardStore } from './stores/dashboard'
import FeedNotice from './components/FeedNotice.vue'
import { usePerformance } from './services/usePerformance'
import { useDisplayRuntime } from './services/useDisplayRuntime'
import { useScreenScale } from './services/useScreenScale'

const store = useDashboardStore()
usePerformance()
useDisplayRuntime()
const scaleStyle = useScreenScale()
const fit = new URLSearchParams(location.search).get('fit') || 'fill'
const seamValues = (new URLSearchParams(location.search).get('seams') || '').split(',').map(Number).filter(n => n > 0 && n < 100).sort((a,b) => a-b)
// 两条拼缝将三屏分成三个独立安全区；不以遮罩盖住文字。--vw 为逻辑视口宽的 1%，放大后拼缝仍落在物理屏的同一百分比处。
// fit=contain 把内容收在 1920 逻辑宽内，不跨物理拼缝，因此不启用拼缝安全区
const seamLayout = fit !== 'contain' && seamValues.length === 2 && seamValues[0]! >= 20 && seamValues[1]! <= 80 && seamValues[1]! - seamValues[0]! >= 20
  ? { '--seam-left': `calc(${seamValues[0]} * var(--vw) - 28px)`, '--seam-center': `calc(${seamValues[1]! - seamValues[0]!} * var(--vw) - 24px)`, '--seam-right': `calc(${100-seamValues[1]!} * var(--vw) - 28px)` }
  : undefined
let freshnessTimer: number | undefined
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') store.escape()
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
  <div class="viewport" data-screen-scale :class="[{ kiosk: store.kioskOn, 'cursor-hidden': store.cursorHidden, scaled: store.screenScale > 1 }, `fit-${fit}`]" :style="scaleStyle">
    <div class="screen" :class="{ 'motion-off': !store.decorationsOn, 'seam-safe': seamLayout }" :style="seamLayout">
      <div class="heading">
        <TopBar />
      </div>
      <!-- 顶部悬浮提示：数据状态与操作反馈都浮在顶栏下方居中，不占布局，避免断线抖动时整屏跳动 -->
      <div class="top-stack">
        <FeedNotice />
        <div v-if="store.notice && store.checkedAt - store.noticeAt < 5000" class="toast" role="status">{{ store.notice }}</div>
      </div>
      <main class="middle">
        <div class="col left">
          <KpiOverview />
          <TrendChart />
          <TopHubs />
        </div>
        <MapChart>
          <HubDetail />
          <Hud />
        </MapChart>
        <div class="col right">
          <EventStream />
        </div>
      </main>
      <footer class="bottom">
        <RouteRank />
        <WarehousePanel />
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
.interactive-row:focus-visible, .tile:focus-visible { outline: 2px solid var(--color-barLight); outline-offset: -2px; }
button:focus-visible, [role='button']:focus-visible {
  background: var(--color-infoBg);
  color: var(--color-heading);
  outline-offset: -3px;
  box-shadow: inset 0 0 0 2px var(--color-panel);
  border-radius: var(--radius-control);
  position: relative;
  z-index: 2;
}
.motion-off *, .motion-off *::before, .motion-off *::after { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
</style>

<style scoped>
.viewport {
  --vw: 1vw;
  --vh: 1vh;
  min-height: 100vh;
  min-height: 100dvh;
}
/* 放大模式：zoom 后 vh 会被再乘一次，高度改用逻辑像素 --vh（由 useScreenScale 下发）。须在 fit 规则之前，fit-width 才能覆盖 */
.viewport.scaled { min-height: calc(var(--vh) * 100); }
.scaled .screen { height: calc(var(--vh) * 100); }
.kiosk { user-select: none; }
.cursor-hidden, .cursor-hidden :deep(*) { cursor: none !important; }
.top-stack {
  position: absolute;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: min(760px, calc(100% - 32px));
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  z-index: 200;
  pointer-events: none;
}
.top-stack > * { pointer-events: auto; box-shadow: var(--shadow-panel); }
.toast { max-width: 100%; padding: 8px 16px; background: var(--color-overlay); border: 1px solid var(--color-accent); border-radius: var(--radius-panel); font-size: var(--font-body); color: var(--color-heading); overflow-wrap: anywhere; }
@media (max-height: 820px) and (min-width: 1280px) { .top-stack { top: 76px; } }
@media (max-width: 767px) { .top-stack { position: fixed; top: var(--space-2); } }
.fit-contain .screen { max-width: 1920px; margin-inline: auto; }
/* contain 内容宽不超过 1920：组件里的 --vw 也封顶在 19.2px（放大模式由 useScreenScale 按同样口径下发） */
.fit-contain { --vw: min(1vw, 19.2px); }
.fit-width .screen { height: auto; }
.screen {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  min-height: 900px;
  background: var(--color-canvas);
  display: grid;
  grid-template-rows: auto minmax(560px, 1fr) 196px;
  gap: var(--space-3);
  padding: var(--space-4);
  position: relative;
}
.heading { display: grid; gap: var(--space-2); }
/* 左右两列与底部条固定尺寸，地图吸收全部剩余空间 */
.middle {
  display: grid;
  grid-template-columns: 420px minmax(0, 1fr) 420px;
  gap: var(--space-3);
  min-height: 0;
}
.col {
  display: grid;
  gap: var(--space-3);
  min-height: 0;
  min-width: 0;
}
.left { grid-template-rows: auto minmax(160px, 1fr) 236px; }
.right { grid-template-rows: minmax(0, 1fr); }
.bottom {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 640px;
  gap: var(--space-3);
}
@media (max-width: 1599px), (max-height: 980px) {
  .screen { grid-template-rows: auto minmax(520px, 1fr) 168px; }
  .middle { grid-template-columns: 340px minmax(0, 1fr) 340px; }
  .left { grid-template-rows: auto minmax(150px, 1fr) 220px; }
  .bottom { grid-template-columns: minmax(0, 1fr) 520px; }
}
/* 矮屏（如 1366×768 笔记本）：正常状态一屏放下；出现数据提示条时允许少量滚动，不压缩图表可读高度 */
@media (max-height: 820px) and (min-width: 1280px) {
  .screen { height: auto; min-height: 100vh; min-height: 100dvh; grid-template-rows: auto minmax(520px, 1fr) 150px; padding: var(--space-3); gap: var(--space-2); }
  .middle, .col, .bottom { gap: var(--space-2); }
  /* 中间三列不以内容撑高（告警条数随高度变化，避免互相放大），行高只取最小值与剩余空间 */
  .middle > * { contain: size; }
  .left { grid-template-rows: auto minmax(150px, 1fr) 176px; }
}
/* 放大模式下逻辑高度为 1080，逻辑宽 ≥ 2400 等价于宽高比 ≥ 20/9（媒体查询只看物理 CSS 尺寸）。
   宽屏规则都排除 fit-contain：媒体查询看的是视口，而 contain 的内容宽固定 ≤1920，应沿用 1920 布局 */
@media (min-width: 2400px) and (max-height: 1080px), (min-height: 1081px) and (min-aspect-ratio: 20/9) {
  .viewport:not(.fit-contain) .middle { grid-template-columns: 520px minmax(0, 1fr) 520px; }
  .viewport:not(.fit-contain) .bottom { grid-template-columns: minmax(0, 1fr) 800px; }
}
@media (max-width: 1279px) {
  .screen { height: auto; grid-template-rows: auto auto auto; }
  .bottom { grid-template-columns: minmax(0, 1fr); grid-template-rows: 196px 196px; }
  .middle { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .middle > :deep(.map-wrap) { grid-column: 1 / -1; grid-row: 1; min-height: 520px; }
  .col { min-height: 600px; }
}
@media (max-aspect-ratio: 3/2) and (min-width: 1280px) {
  .screen { height: auto; min-height: 100vh; grid-template-rows: auto auto 176px; }
  .scaled .screen { height: auto; min-height: calc(var(--vh) * 100); }
  .middle { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .middle > :deep(.map-wrap) { grid-column: 1 / -1; grid-row: 1; min-height: 600px; }
  .col { min-height: 720px; }
}
@media (max-width: 767px) {
  .screen { padding: var(--space-2); gap: var(--space-2); grid-template-rows: auto auto auto; }
  .middle { grid-template-columns: minmax(0, 1fr); gap: var(--space-2); }
  .middle > :deep(.map-wrap) { min-height: 440px; }
  .bottom { min-height: 520px; grid-template-rows: 320px 200px; }
}
@media (min-aspect-ratio: 5/2) and (min-width: 2000px) {
  .viewport:not(.fit-contain) .middle { grid-template-columns: minmax(560px, 1fr) minmax(700px, 2fr) minmax(640px, 1fr); }
  .viewport:not(.fit-contain) .left, .viewport:not(.fit-contain) .right { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }
  .viewport:not(.fit-contain) .left > :first-child, .viewport:not(.fit-contain) .right > :first-child { grid-column: 1 / -1; }
  .viewport:not(.fit-contain) .left { grid-template-rows: auto minmax(0, 1fr); }
  .viewport:not(.fit-contain) .right { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
}
@media (min-width: 2000px) and (max-height: 1080px), (min-height: 1081px) and (min-aspect-ratio: 50/27) {
  /* 拼缝模式：中部与底部直接落在三屏网格里，左列向下延伸占满左屏，排行占中屏底部、仓配占右屏底部，
     各面板宽度等于所在屏的安全区，不再把两个底部面板挤进中屏；fit=contain 不启用拼缝 */
  .viewport:not(.fit-contain) .seam-safe { grid-template-columns: var(--seam-left) var(--seam-center) var(--seam-right); column-gap: 24px; }
  .viewport:not(.fit-contain) .seam-safe .heading { grid-column: 1 / -1; }
  .viewport:not(.fit-contain) .seam-safe .middle, .viewport:not(.fit-contain) .seam-safe .bottom { display: contents; }
  .viewport:not(.fit-contain) .seam-safe .left { grid-column: 1; grid-row: 2 / 4; }
  .viewport:not(.fit-contain) .seam-safe .middle > :deep(.map-wrap) { grid-column: 2; grid-row: 2; }
  .viewport:not(.fit-contain) .seam-safe .right { grid-column: 3; grid-row: 2; }
  .viewport:not(.fit-contain) .seam-safe .bottom > :first-child { grid-column: 2; grid-row: 3; }
  .viewport:not(.fit-contain) .seam-safe .bottom > :last-child { grid-column: 3; grid-row: 3; }
  .viewport:not(.fit-contain) .seam-safe :deep(.topbar) { grid-template-columns: var(--seam-left) var(--seam-center) var(--seam-right); gap: 24px; padding-inline: 0; }
}
</style>
