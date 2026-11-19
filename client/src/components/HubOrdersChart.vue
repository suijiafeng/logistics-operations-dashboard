<script setup lang="ts">
import { watch } from 'vue'
import { COLORS, FONT } from '../design/tokens'
import { fmtInt } from '../services/format'
import { AXIS_CLEAN, SPLIT_LINE, TEXT, TOOLTIP, useEcharts } from '../services/useEcharts'

const props = defineProps<{ orders: number[]; labels?: string[] }>()
const { el, chart } = useEcharts()

function render() {
  const c = chart.value
  if (!c || props.orders.length === 0) return
  const last = props.orders.length - 1
  c.setOption({
    grid: { left: 0, right: 4, top: 8, bottom: 0, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      formatter: (params: unknown) => {
        const row = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number } | undefined
        const index = row?.dataIndex ?? 0
        const label = props.labels?.[index] ?? ''
        const suffix = index === last ? '（累计中）' : ''
        return `${label}${suffix}：${fmtInt(props.orders[index] ?? 0)} 单`
      },
    },
    xAxis: {
      type: 'category',
      data: props.orders.map((_, index) => props.labels?.[index] ?? String(index)),
      ...AXIS_CLEAN,
      axisLabel: { ...TEXT, fontFamily: FONT.number, fontSize: FONT.small, interval: 0, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      ...AXIS_CLEAN,
      splitNumber: 2,
      splitLine: SPLIT_LINE,
      axisLabel: { show: false },
    },
    series: [{
      type: 'bar',
      barWidth: '62%',
      data: props.orders.map((value, index) => ({
        value,
        itemStyle: index === last
          ? { color: COLORS.accentArea, borderColor: COLORS.accent, borderWidth: 1, borderType: 'dashed', borderRadius: [2, 2, 0, 0] }
          : { color: COLORS.barLight, borderRadius: [2, 2, 0, 0] },
      })),
    }],
  }, true)
}

watch([chart, () => props.orders, () => props.labels], render)
</script>

<template>
  <div ref="el" class="chart" role="img" :aria-label="`近一小时关联运单：${orders.join('、')}`" />
</template>

<style scoped>
.chart { height: 88px; }
</style>
