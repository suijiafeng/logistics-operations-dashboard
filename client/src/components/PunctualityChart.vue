<script setup lang="ts">
import { watch } from 'vue'
import Panel from './Panel.vue'
import { useEcharts, TEXT } from '../services/useEcharts'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const { el, chart } = useEcharts()

const COLORS = ['#34c77b', '#e8b13c', '#ff8a3d', '#f0524d']

function render() {
  const c = chart.value
  if (!c || store.punctuality.length === 0) return
  c.setOption({
    grid: { left: 8, right: 30, top: 10, bottom: 2, containLabel: true },
    tooltip: {
      trigger: 'item',
      backgroundColor: '#131c26',
      borderWidth: 0,
      textStyle: { color: '#d7e2ec', fontSize: 12 },
      formatter: '{b}：{c}%',
    },
    xAxis: { type: 'value', max: 100, show: false },
    yAxis: {
      type: 'category',
      inverse: true,
      data: store.punctuality.map((p) => p.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...TEXT, fontSize: 12 },
    },
    series: [
      {
        type: 'bar',
        barWidth: 13,
        data: store.punctuality.map((p, i) => ({ ...p, itemStyle: { color: COLORS[i], borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', color: '#c8d6e3', fontSize: 12, formatter: '{c}%' },
      },
    ],
  })
}

watch(() => store.chartVersion, render)
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
