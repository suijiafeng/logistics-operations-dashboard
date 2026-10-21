<script setup lang="ts">
import { watch } from 'vue'
import Panel from './Panel.vue'
import { useEcharts, TEXT } from '../services/useEcharts'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const { el, chart } = useEcharts()

const COLORS = ['#ff8a3d', '#5b7a99', '#34c77b', '#e8b13c']

function render() {
  const c = chart.value
  if (!c || store.modes.length === 0) return
  c.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: '#131c26',
      borderWidth: 0,
      textStyle: { color: '#d7e2ec', fontSize: 12 },
      formatter: '{b}：{d}%',
    },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { ...TEXT, fontSize: 12 },
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '68%'],
        center: ['50%', '40%'],
        itemStyle: { borderColor: '#0d141b', borderWidth: 2 },
        label: { color: '#c8d6e3', fontSize: 11, formatter: '{d}%' },
        labelLine: { lineStyle: { color: '#39506a' }, length: 8, length2: 6 },
        data: store.modes.map((m, i) => ({ ...m, itemStyle: { color: COLORS[i % COLORS.length] } })),
      },
    ],
  })
}

watch(() => store.chartVersion, render)
</script>

<template>
  <Panel title="运输方式占比">
    <div ref="el" class="chart" />
  </Panel>
</template>

<style scoped>
.chart {
  flex: 1;
  min-height: 0;
}
</style>
