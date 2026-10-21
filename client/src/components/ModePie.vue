<script setup lang="ts">
import { computed, watch } from 'vue'
import Panel from './Panel.vue'
import { useEcharts, TOOLTIP } from '../services/useEcharts'
import { COLORS as THEME } from '../design/tokens'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const { el, chart } = useEcharts()

const COLORS = [THEME.accent, THEME.muted, THEME.success, THEME.warning]
const shares = computed(() => {
  const sum = store.modes.reduce((total, item) => total + item.value, 0)
  return store.modes.map((item, index) => ({ ...item, color: COLORS[index % COLORS.length],
    percent: sum ? (item.value / sum * 100).toFixed(0) : '0' }))
})

function render() {
  const c = chart.value
  if (!c || store.modes.length === 0) return
  c.setOption({
    tooltip: {
      ...TOOLTIP,
      trigger: 'item',
      formatter: (p: { name: string; percent?: number }) => `${p.name}：${(p.percent ?? 0).toFixed(0)}%`,
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '76%'],
        center: ['50%', '50%'],
        itemStyle: { borderColor: THEME.panel, borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        data: store.modes.map((m, i) => ({ ...m, itemStyle: { color: COLORS[i % COLORS.length] } })),
      },
    ],
  })
}

watch([chart, () => store.chartVersion], render)
</script>

<template>
  <Panel title="运输方式占比">
    <div class="mode-layout">
      <div ref="el" class="chart" />
      <ul class="legend" aria-label="运输方式占比">
        <li v-for="item in shares" :key="item.name"><i :style="{ background: item.color }" /><span>{{ item.name }}</span><b>{{ item.percent }}%</b></li>
      </ul>
    </div>
  </Panel>
</template>

<style scoped>
.chart {
  width: 40%;
  height: 100%;
  min-height: 0;
}
.mode-layout { display: flex; align-items: center; flex: 1; min-height: 0; gap: var(--space-2); }
.legend { flex: 1; list-style: none; display: grid; gap: var(--space-1); font-size: var(--font-small); color: var(--color-secondary); }
.legend li { display: flex; align-items: center; gap: var(--space-2); line-height: 20px; }
.legend i { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.legend b { margin-left: auto; color: var(--color-text); font-weight: 500; font-variant-numeric: tabular-nums; }
</style>
