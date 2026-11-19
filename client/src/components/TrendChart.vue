<script setup lang="ts">
import { computed, watch } from 'vue'
import Panel from './Panel.vue'
import { useEcharts, TEXT, TOOLTIP, AXIS_CLEAN, SPLIT_LINE } from '../services/useEcharts'
import { COLORS, FONT } from '../design/tokens'
import { formatTrendTooltip } from '../services/formatTrendTooltip'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const { el, chart } = useEcharts()

function beijingHour(ts: number) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ts)))
}
const asOf = computed(() => store.dataAt
  ? new Date(store.dataAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
  : '')

// 已完成小时：实心柱；当前小时：虚线框半透明柱（累计中）；未来小时不画
function render() {
  const c = chart.value
  if (!c || store.trend.length === 0) return
  const currentHour = beijingHour(store.dataAt || Date.now())
  const hours = store.trend.map((_, h) => String(h).padStart(2, '0'))
  c.setOption({
    grid: { left: 0, right: 4, top: 8, bottom: 0, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(47, 128, 255, 0.10)' } },
      formatter: (params: unknown) => formatTrendTooltip(params, store.trend, currentHour, store.trendYesterday),
    },
    xAxis: {
      type: 'category',
      data: hours,
      ...AXIS_CLEAN,
      axisLabel: { ...TEXT, fontFamily: FONT.number, interval: (i: number) => i % 6 === 0 },
    },
    yAxis: {
      type: 'value',
      splitNumber: 3,
      ...AXIS_CLEAN,
      splitLine: SPLIT_LINE,
      axisLabel: { ...TEXT, fontFamily: FONT.number, formatter: (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : `${v}`) },
    },
    series: [
      {
        name: '已完成小时',
        type: 'bar',
        barWidth: '62%',
        itemStyle: { color: COLORS.barStrong, borderRadius: [2, 2, 0, 0] },
        data: store.trend.map((value, h) => (h < currentHour ? value : null)),
      },
      {
        name: '当前小时（累计中）',
        type: 'bar',
        barWidth: '62%',
        barGap: '-100%',
        itemStyle: { color: COLORS.accentArea, borderColor: COLORS.accent, borderWidth: 1, borderType: 'dashed', borderRadius: [2, 2, 0, 0] },
        data: store.trend.map((value, h) => (h === currentHour ? value : null)),
      },
      {
        // 昨日同期参考线：浅色细虚线，只作对比背景，不抢柱子的视线
        name: '昨日',
        type: 'line',
        symbol: 'none',
        silent: true,
        z: 3,
        lineStyle: { color: COLORS.secondary, width: 1.5, type: [4, 3], opacity: 0.7 },
        data: store.trendYesterday.length === 24 ? store.trendYesterday : [],
      },
    ],
  })
}

watch([chart, () => store.chartVersion], render)
</script>

<template>
  <Panel title="今日分时运单" :extra="`${asOf ? `截至 ${asOf}` : '北京时间'}${store.trendYesterday.length === 24 ? ' · 虚线为昨日' : ''}`">
    <div ref="el" class="chart" role="img" aria-label="今日各小时运单量柱状图，蓝色虚线柱为当前小时累计中，浅色虚线为昨日各小时运单" />
  </Panel>
</template>

<style scoped>
.chart {
  flex: 1;
  min-height: 0;
}
</style>
