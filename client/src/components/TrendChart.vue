<script setup lang="ts">
import { watch } from 'vue'
import Panel from './Panel.vue'
import { useEcharts, TEXT, ACCENT } from '../services/useEcharts'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const { el, chart } = useEcharts()

function render() {
  const c = chart.value
  if (!c || store.trend.length === 0) return
  const hours = store.trend.map((_, h) => `${String(h).padStart(2, '0')}:00`)
  const currentHour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23',
  }).format(new Date(store.dataAt || Date.now())))
  const completed = store.trend.map((value, h) => h < currentHour ? value : null)
  const partial = store.trend.map((value, h) => h === currentHour || h === currentHour - 1 ? value : null)
  c.setOption({
    grid: { left: 8, right: 12, top: 22, bottom: 2, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#131c26',
      borderWidth: 0,
      textStyle: { color: '#d7e2ec', fontSize: 12 },
    },
    xAxis: {
      type: 'category',
      data: hours,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#263646' } },
      axisTick: { show: false },
      axisLabel: { ...TEXT, fontSize: 11, interval: 3 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#16222d' } },
      axisLabel: { ...TEXT, fontSize: 11, formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`) },
    },
    series: [
      {
        name: '运单量',
        type: 'line',
        smooth: false,
        symbol: 'none',
        lineStyle: { color: ACCENT, width: 2 },
        areaStyle: { color: 'rgba(255,138,61,0.13)' },
        data: completed,
      },
      {
        name: '当前小时（累计中）',
        type: 'line',
        smooth: false,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 5,
        itemStyle: { color: ACCENT, opacity: 0.65 },
        lineStyle: { color: ACCENT, type: 'dashed', width: 2, opacity: 0.65 },
        data: partial,
      },
    ],
  })
}

watch(() => store.chartVersion, render)
</script>

<template>
  <Panel title="今日分时运单" extra="北京时间 · 虚线累计中">
    <div ref="el" class="chart" />
  </Panel>
</template>

<style scoped>
.chart {
  flex: 1;
  min-height: 0;
}
</style>
