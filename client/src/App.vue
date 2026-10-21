<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
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

// 大屏适配：1920×1080 基准画布，按窗口尺寸等比缩放并居中
const scale = ref(1)
function updateScale() {
  scale.value = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
}

const store = useDashboardStore()
function onKey(e: KeyboardEvent) {
  if (e.key === 'h' || e.key === 'H') store.hudOn = !store.hudOn
}

onMounted(() => {
  updateScale()
  window.addEventListener('resize', updateScale)
  window.addEventListener('keydown', onKey)
  startDataFeed()
  // 开发模式调试钩子：方便用无头浏览器验收下钻/网点详情等交互状态
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__dashboard = store
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScale)
  window.removeEventListener('keydown', onKey)
  stopDataFeed()
})
</script>

<template>
  <div class="viewport">
    <div class="screen" :style="{ transform: `scale(${scale})` }">
      <TopBar />
      <main class="middle">
        <div class="col left">
          <TrendChart class="grow-4" />
          <ModePie class="grow-3" />
          <TopHubs class="grow-3" />
        </div>
        <MapChart>
          <HubDetail />
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
      <Hud />
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
  height: 100%;
  background: #04070a;
  overflow: hidden;
}
body {
  font-family: 'Noto Sans CJK SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #d7e2ec;
  -webkit-font-smoothing: antialiased;
}
</style>

<style scoped>
.viewport {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.screen {
  width: 1920px;
  height: 1080px;
  flex: none;
  transform-origin: center center;
  background: #070b10;
  display: grid;
  grid-template-rows: 68px 1fr 172px;
  gap: 10px;
  padding: 10px;
  position: relative;
}
.middle {
  display: grid;
  grid-template-columns: 302px 1fr 332px;
  gap: 10px;
  min-height: 0;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  min-width: 0;
}
.grow-2 { flex: 2 1 0; }
.grow-3 { flex: 3 1 0; }
.grow-4 { flex: 4 1 0; }
.grow-5 { flex: 5 1 0; }
.bottom {
  min-height: 0;
  display: flex;
}
.bottom :deep(.panel) {
  flex: 1;
}
</style>
