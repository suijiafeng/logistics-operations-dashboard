<script setup lang="ts">
import { computed, watch } from 'vue'
import { DEMO_WAYBILLS } from '../data/deliveryTracks'
import { COLORS, FONT } from '../design/tokens'
import { analyzeTrack, efficiencyPercent } from '../services/trackGeometry'
import { AXIS_CLEAN, SPLIT_LINE, TEXT, TOOLTIP, useEcharts } from '../services/useEcharts'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const { el, chart } = useEcharts()

const rows = computed(() => DEMO_WAYBILLS.map((waybill) => ({
  waybill,
  efficiency: efficiencyPercent(analyzeTrack(waybill.points).elapsedMs, waybill.promisedMs),
})))
const aria = computed(() => rows.value.map((row) => {
  const mark = row.waybill.id === store.selectedWaybillId ? '，当前选中' : ''
  return `${row.waybill.label} 时效 ${Math.round(row.efficiency)}%${mark}`
}).join('；'))

function render() {
  const c = chart.value
  if (!c) return
  c.setOption({
    grid: { left: 0, right: 48, top: 4, bottom: 0, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: 'item',
      formatter: (params: unknown) => {
        const row = params as { dataIndex?: number; value?: number }
        const item = rows.value[row.dataIndex ?? -1]
        if (!item || row.value == null) return ''
        return `${item.waybill.no}<br/>${item.waybill.label}<br/>时效 ${row.value.toFixed(1)}%`
      },
    },
    xAxis: {
      type: 'value',
      max: 140,
      splitNumber: 3,
      ...AXIS_CLEAN,
      splitLine: SPLIT_LINE,
      axisLabel: { ...TEXT, fontFamily: FONT.number, formatter: (value: number) => `${value}%` },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.value.map((row) => row.waybill.label),
      ...AXIS_CLEAN,
      axisLabel: {
        ...TEXT,
        color: (value?: string) => rows.value.find((row) => row.waybill.label === value)?.waybill.id === store.selectedWaybillId ? COLORS.accentText : COLORS.secondary,
      },
    },
    series: [{
      name: '时效',
      type: 'bar',
      barWidth: 12,
      cursor: 'pointer',
      label: { show: true, position: 'right', fontFamily: FONT.number, fontSize: FONT.small, formatter: (params: { value?: number }) => `${Math.round(params.value ?? 0)}%` },
      data: rows.value.map((row) => {
        const selected = row.waybill.id === store.selectedWaybillId
        return {
          value: Math.round(row.efficiency * 10) / 10,
          itemStyle: { color: selected ? COLORS.accent : COLORS.barStrong, borderRadius: [0, 3, 3, 0] },
          label: { color: selected ? COLORS.accentText : COLORS.secondary },
        }
      }),
    }],
  }, true)
  c.off('click')
  c.on('click', (raw: unknown) => {
    const index = (raw as { dataIndex?: number }).dataIndex
    const waybill = index == null ? undefined : DEMO_WAYBILLS[index]
    if (waybill) store.selectWaybill(waybill.id)
  })
}

watch([chart, () => store.selectedWaybillId], render)
</script>

<template>
  <div ref="el" class="chart" role="img" :aria-label="`运输效率，承诺用时除以实际用时。${aria}`" />
</template>

<style scoped>
.chart { flex: 1; min-height: 0; }
</style>
