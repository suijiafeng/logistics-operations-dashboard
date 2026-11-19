<script setup lang="ts">
import { computed } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'
import { fmtCompact, fmtInt } from '../services/format'

const store = useDashboardStore()
// 引擎只提供全国口径 KPI，下钻时也如实标注「全国」，不推算分省数值
const items = computed(() => {
  const k = store.kpi
  const ok = store.hasData
  return [
    { label: '在途车辆', value: ok ? fmtCompact(k.enRoute) : '—', full: fmtInt(k.enRoute), unit: '台' },
    { label: '今日运单', value: ok ? fmtCompact(k.ordersToday) : '—', full: fmtInt(k.ordersToday), unit: '单' },
    { label: '准时率', value: ok ? k.onTimeRate.toFixed(1) : '—', full: `${k.onTimeRate.toFixed(1)}%`, unit: '%' },
    { label: '待处理异常', value: ok ? fmtCompact(k.pendingAnomalies) : '—', full: fmtInt(k.pendingAnomalies), unit: '起', alert: ok && k.pendingAnomalies > 0 },
  ]
})
</script>

<template>
  <Panel title="今日概况" extra="全国口径">
    <dl class="grid">
      <div v-for="item in items" :key="item.label" class="tile">
        <dt>{{ item.label }}</dt>
        <dd :title="`${item.label}：${item.full}${item.unit === '%' ? '' : ` ${item.unit}`}`">
          <span class="value" :class="{ alert: item.alert }">{{ item.value }}</span><small>{{ item.unit }}</small>
        </dd>
      </div>
    </dl>
  </Panel>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.tile {
  container-type: inline-size;
  min-width: 0;
  padding: 8px 12px 8px 0;
  background: transparent;
}
.tile:nth-child(odd) { border-right: 1px solid var(--color-border); padding-right: 12px; }
.tile:nth-child(even) { padding-left: 12px; }
.tile:nth-child(n + 3) { border-top: 1px solid var(--color-border); }
dt { font-size: 13px; color: var(--color-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
dd { display: flex; align-items: baseline; gap: var(--space-1); min-width: 0; margin-top: 2px; }
.value {
  min-width: 0;
  font-family: var(--font-number);
  font-size: var(--font-kpi);
  /* 位数变多时先随卡片宽度缩小字号，再兜底省略 */
  font-size: clamp(20px, 15cqw, var(--font-kpi));
  font-weight: 600;
  line-height: 1.2;
  color: var(--color-heading);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.value.alert { color: var(--color-danger); }
small { flex: none; font-size: var(--font-body); color: var(--color-tertiary); }
/* 紧凑布局（1600 宽以下或 980 高以下）：卡片收紧，把高度让给运单链路与分时柱图；矮屏再收一档 */
@media (max-width: 1599px), (max-height: 980px) {
  .tile { padding-block: 4px; }
  dt { font-size: var(--font-small); }
  .value { font-size: 22px; font-size: clamp(16px, 13cqw, 22px); }
}
@media (max-height: 820px) {
  .grid { gap: 4px; }
  .tile { padding: 2px 10px 3px; }
  dt { font-size: 12px; line-height: 1.3; }
  .value { font-size: 18px; font-size: clamp(15px, 11cqw, 18px); }
  small { font-size: var(--font-small); }
}
</style>
