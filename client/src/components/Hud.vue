<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useDashboardStore } from '../stores/dashboard'

// 性能 HUD：rAF 统计 FPS 与平均帧耗时，同时展示数据链路指标（点位、增量包大小、推送延迟）
// 所有数字都是本机实时测得，不做任何预设
const store = useDashboardStore()
const fps = ref(0)
const frameMs = ref(0)
let raf = 0
let frames = 0
let lastSec = performance.now()
let lastFrame = performance.now()
let frameCostSum = 0

function loop(now: number) {
  frames++
  frameCostSum += now - lastFrame
  lastFrame = now
  if (now - lastSec >= 1000) {
    fps.value = Math.round((frames * 1000) / (now - lastSec))
    frameMs.value = Math.round((frameCostSum / Math.max(frames, 1)) * 10) / 10
    frames = 0
    frameCostSum = 0
    lastSec = now
  }
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div v-if="store.hudOn" class="hud">
    <div class="hud-title">性能监测（本机实测）</div>
    <div class="row"><span>FPS</span><b>{{ fps }}</b></div>
    <div class="row"><span>平均帧耗时</span><b>{{ frameMs }} ms</b></div>
    <div class="row"><span>车辆点位</span><b>{{ store.vehicleCount.toLocaleString('zh-CN') }}</b></div>
    <div class="row"><span>增量包大小</span><b>{{ store.lastDeltaKB.toFixed(1) }} KB/s</b></div>
    <div class="row"><span>推送延迟</span><b>{{ store.latencyMs }} ms</b></div>
    <div class="row"><span>已收增量包</span><b>{{ store.deltaCount }}</b></div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  /* 悬浮在中央地图右下角，不遮挡左右数据列 */
  right: 362px;
  bottom: 192px;
  width: 196px;
  background: rgba(8, 12, 16, 0.92);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  z-index: 20;
  pointer-events: none;
}
.hud-title {
  color: #ffb066;
  font-weight: 600;
  letter-spacing: 1px;
  margin-bottom: 6px;
}
.row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
  color: #7e93a8;
}
.row b {
  color: #d7e2ec;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
</style>
