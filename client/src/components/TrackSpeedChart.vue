<script setup lang="ts">
import { watch } from 'vue'
import type { DemoTrackPoint } from '../data/deliveryTracks'
import { COLORS, FONT } from '../design/tokens'
import { speedSamples, type Stay } from '../services/trackGeometry'
import { areaFade, AXIS_CLEAN, SPLIT_LINE, TEXT, TOOLTIP, useEcharts } from '../services/useEcharts'

const props = defineProps<{ points: DemoTrackPoint[]; stays: Stay[] }>()
const { el, chart } = useEcharts()

function clock(t: number) {
  return new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
}

function render() {
  const c = chart.value
  const points = props.points
  if (!c || points.length < 2) return
  const first = points[0]!.t
  const last = points[points.length - 1]!.t
  c.setOption({
    grid: { left: 0, right: 8, top: 16, bottom: 0, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      formatter: (params: unknown) => {
        const row = (Array.isArray(params) ? params[0] : params) as { data?: [number, number] } | undefined
        const data = row?.data
        if (!data) return ''
        const staying = props.stays.some((stay) => data[0] >= stay.startT && data[0] <= stay.endT)
        return `${clock(data[0])}<br/>速度 ${data[1].toFixed(1)} km/h${staying ? '<br/>停留中' : ''}`
      },
    },
    xAxis: {
      type: 'time',
      min: first,
      max: last,
      ...AXIS_CLEAN,
      axisLabel: { ...TEXT, fontFamily: FONT.number, hideOverlap: true, formatter: (value: number) => clock(value) },
    },
    yAxis: {
      type: 'value',
      min: 0,
      splitNumber: 3,
      ...AXIS_CLEAN,
      splitLine: SPLIT_LINE,
      axisLabel: { ...TEXT, fontFamily: FONT.number, formatter: (value: number) => `${value}` },
    },
    series: [{
      name: '速度',
      type: 'line',
      smooth: false,
      showSymbol: false,
      lineStyle: { color: COLORS.barLight, width: 1.5 },
      areaStyle: { color: areaFade(91, 166, 238) },
      data: speedSamples(points).map((sample) => [sample.t, Math.round(sample.speedKmh * 10) / 10]),
      markArea: {
        silent: true,
        itemStyle: { color: 'rgba(232, 177, 60, 0.38)' },
        label: { show: false },
        data: props.stays.map((stay) => [{ xAxis: stay.startT }, { xAxis: stay.endT }]),
      },
    }],
  }, true)
}

watch([chart, () => props.points, () => props.stays], render)
</script>

<template>
  <div ref="el" class="chart" role="img" aria-label="当前运单速度随时间变化，琥珀色带为停留" />
</template>

<style scoped>
.chart { flex: 1; min-height: 120px; }
</style>
