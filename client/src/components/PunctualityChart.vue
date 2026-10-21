<script setup lang="ts">
import { watch } from 'vue'
import Panel from './Panel.vue'
import { useEcharts, TEXT, TOOLTIP } from '../services/useEcharts'
import { COLORS as THEME } from '../design/tokens'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const { el, chart } = useEcharts()

const COLORS = [THEME.success, THEME.warning, THEME.accent, THEME.danger]

function render() {
  const c = chart.value
  if (!c || store.punctuality.length === 0) return
  c.setOption({
    grid: { left: 8, right: 30, top: 10, bottom: 2, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: 'item',
      formatter: '{b}：{c}%',
    },
    xAxis: { type: 'value', max: 100, show: false },
    yAxis: {
      type: 'category',
      inverse: true,
      data: store.punctuality.map((p) => p.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...TEXT, interval: 0 },
    },
    series: [
      {
        type: 'bar',
        barWidth: 12,
        data: store.punctuality.map((p, i) => ({ ...p, itemStyle: { color: COLORS[i], borderRadius: [0, 4, 4, 0] } })),
        label: { ...TEXT, show: true, position: 'right', color: THEME.text, formatter: '{c}%' },
      },
    ],
  })
}

watch([chart, () => store.chartVersion], render)
</script>

<template>
  <Panel title="时效达标分布" extra="按承诺时效">
    <div ref="el" class="chart" />
  </Panel>
</template>

<style scoped>
.chart {
  flex: 1;
  min-height: 0;
}
</style>
