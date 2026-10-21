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
      formatter: (p: { name: string; percent?: number }) => `${p.name}：${(p.percent ?? 0).toFixed(0)}%`,
    },
    legend: {
      top: 'middle',
      right: 2,
      orient: 'vertical',
      itemGap: 16,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { ...TEXT, fontSize: 12 },
      formatter: (name: string) => {
        const sum = store.modes.reduce((total, item) => total + item.value, 0)
        const value = store.modes.find((item) => item.name === name)?.value ?? 0
        return `${name}  ${sum ? (value / sum * 100).toFixed(0) : '0'}%`
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['36%', '52%'],
        center: ['26%', '50%'],
        itemStyle: { borderColor: '#0d141b', borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
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
