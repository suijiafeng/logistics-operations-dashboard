<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { HIGH_UTILIZATION } from '../design/tokens'

const store = useDashboardStore()
const hub = computed(() => store.selectedHub)

function fmt(n?: number) {
  return (n ?? 0).toLocaleString('zh-CN')
}
</script>

<template>
  <section v-if="hub && store.hasData" class="hub-detail" aria-label="网点详情">
    <header>
      <h4>{{ hub.name }}分拨中心</h4>
      <button class="close" aria-label="关闭网点详情（Esc）" @click="store.selectHub(null)">×</button>
    </header>
    <div class="rows">
      <div class="row"><span>今日到车</span><b>{{ fmt(hub.arrivals) }} 台</b></div>
      <div class="row"><span>今日发车</span><b>{{ fmt(hub.departures) }} 台</b></div>
      <div class="row"><span>待分拣积压</span><b :class="{ warn: (hub.backlog ?? 0) > 650 }">{{ fmt(hub.backlog) }} 件</b></div>
      <div class="row"><span>网点准时率</span><b>{{ (hub.onTime ?? 0).toFixed(1) }}%</b></div>
    </div>
    <div class="util">
      <div class="util-head"><span>仓配利用率</span><b>{{ hub.utilization ?? 0 }}%</b></div>
      <p class="load-state" :class="{ hot: (hub.utilization ?? 0) >= HIGH_UTILIZATION }">{{ (hub.utilization ?? 0) >= HIGH_UTILIZATION ? '高负载' : '正常' }} · 预警阈值 ≥{{ HIGH_UTILIZATION }}%</p>
      <div class="bar"><div class="fill" :style="{ width: `${hub.utilization ?? 0}%` }" /></div>
    </div>
    <p class="note">数据由模拟引擎按该网点实时状态推送，点击其他网点可切换。</p>
  </section>
</template>

<style scoped>
.hub-detail {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 252px;
  background: var(--color-overlay);
  border-radius: var(--radius-panel);
  padding: var(--space-4) var(--space-4);
  box-shadow: var(--shadow-panel);
  z-index: 5;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}
h4 {
  font-size: var(--font-title);
  color: var(--color-heading);
  letter-spacing: 1px;
}
.close {
  background: none;
  border: none;
  color: var(--color-secondary);
  font-size: var(--font-title);
  cursor: pointer;
  line-height: 1;
}
.close:hover { background: var(--color-hover); color: var(--color-heading); }
.load-state { font-size: var(--font-small); color: var(--color-secondary); margin-bottom: var(--space-1); }
.load-state.hot { color: var(--color-dangerText); }
.rows .row {
  display: flex;
  justify-content: space-between;
  padding: var(--space-1) 0;
  font-size: var(--font-body);
  color: var(--color-secondary);
}
.rows .row b {
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.rows .row b.warn {
  color: var(--color-dangerText);
}
.util {
  margin-top: var(--space-2);
}
.util-head {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-body);
  color: var(--color-secondary);
  margin-bottom: var(--space-1);
}
.util-head b {
  color: var(--color-accentValue);
}
.bar {
  height: 8px;
  background: var(--color-track);
  border-radius: var(--radius-control);
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-control);
  transition: width 0.6s ease;
}
.note {
  margin-top: var(--space-2);
  font-size: var(--font-small);
  color: var(--color-secondary);
  line-height: 1.5;
}
</style>
