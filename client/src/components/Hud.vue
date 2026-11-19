<script setup lang="ts">
import { useDashboardStore } from '../stores/dashboard'

// 性能 HUD：rAF 统计 FPS 与平均帧间隔（相邻 rAF 回调的间隔，含刷新率等待，不是图表绘制 CPU/GPU 耗时），
// 同时展示数据链路指标（点位、增量包大小、推送延迟）
// 所有数字都是本机实时测得，不做任何预设
const store = useDashboardStore()
</script>

<template>
  <div v-if="store.hudOn" class="hud">
    <div class="hud-title">性能监测（本机实测）</div>
    <div class="row"><span>FPS</span><b>{{ store.fps }}</b></div>
    <div class="row" title="相邻动画帧回调的平均间隔，含刷新率等待；不是单帧绘制成本"><span>平均帧间隔</span><b>{{ store.frameMs }} ms</b></div>
    <div class="row"><span>车辆点位</span><b>{{ store.hasData ? store.vehicleCount.toLocaleString('zh-CN') : '—' }}</b></div>
    <div class="row"><span>本视图渲染</span><b>{{ store.renderedVehicles.toLocaleString('zh-CN') }}</b></div>
    <div class="row"><span>画质 / DPR</span><b>{{ store.quality }} / {{ +store.renderDpr.toFixed(2) }}</b></div>
    <div class="row"><span>页面缩放</span><b>×{{ store.screenScale }}</b></div>
    <p v-if="store.qualityReason" class="quality-note">{{ store.qualityReason }}</p>
    <div class="row" title="浏览器解压后的 JSON 大小；引擎开启消息压缩，实际传输约为三分之一"><span>增量包（解压后）</span><b>{{ store.lastDeltaKB.toFixed(1) }} KB/s</b></div>
    <div class="row"><span>推送延迟</span><b>{{ store.latencyMs }} ms</b></div>
    <div class="row"><span>已收增量包</span><b>{{ store.deltaCount }}</b></div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  /* 悬浮在中央地图右下角，不遮挡左右数据列 */
  right: var(--space-4);
  bottom: 160px;
  width: 196px;
  background: var(--color-hud);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-small);
  z-index: 20;
  pointer-events: none;
}
.hud-title {
  color: var(--color-secondary);
  font-weight: 600;
  letter-spacing: normal;
  margin-bottom: var(--space-2);
}
.quality-note { color: var(--color-secondary); font-size: var(--font-small); margin-block: var(--space-1); }
.row {
  display: flex;
  justify-content: space-between;
  padding: var(--space-1) 0;
  color: var(--color-secondary);
}
.row b {
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
</style>
