<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { DemoTrackPoint } from '../data/deliveryTracks'
import { trackMarkers } from '../services/trackMarkers'
import { projectToPlane, traveledPath, type PlaybackSample, type Stay } from '../services/trackGeometry'

const props = defineProps<{
  points: DemoTrackPoint[]
  stays: Stay[]
  pose: PlaybackSample | null
}>()

const host = ref<HTMLElement | null>(null)
const size = ref({ w: 640, h: 360 })
let observer: ResizeObserver | undefined

function measure() {
  const node = host.value
  if (!node) return
  const w = node.clientWidth
  const h = node.clientHeight
  if (w > 0 && h > 0) size.value = { w, h }
}

onMounted(() => {
  measure()
  if (!host.value) return
  observer = new ResizeObserver(measure)
  observer.observe(host.value)
})
onBeforeUnmount(() => observer?.disconnect())

const project = computed(() => projectToPlane(props.points, size.value.w, size.value.h, { top: 36, right: 36, bottom: 28, left: 28 }))

function polyline(points: { lng: number; lat: number }[]) {
  return points.map((point) => {
    const xy = project.value(point)
    return `${xy.x.toFixed(1)},${xy.y.toFixed(1)}`
  }).join(' ')
}

const base = computed(() => polyline(props.points))
const done = computed(() => polyline(traveledPath(props.points, props.pose?.progress ?? 0)))
const markers = computed(() => trackMarkers(props.points, props.stays).map((marker, index) => {
  const xy = project.value(marker)
  const flip = xy.x > size.value.w - 132
  return { ...marker, ...xy, index, anchor: flip ? 'end' as const : 'start' as const, dx: flip ? -10 : 10 }
}))
const vehicle = computed(() => {
  if (!props.pose) return null
  const xy = project.value(props.pose)
  return { x: xy.x, y: xy.y, bearing: props.pose.bearing }
})
const grid = computed(() => {
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
  const { w, h } = size.value
  for (let i = 1; i <= 3; i++) {
    lines.push({ x1: (w * i) / 4, y1: 28, x2: (w * i) / 4, y2: h - 18 })
    lines.push({ x1: 16, y1: (h * i) / 4, x2: w - 16, y2: (h * i) / 4 })
  }
  return lines
})
const bounds = computed(() => {
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const point of props.points) {
    if (point.lng < minLng) minLng = point.lng
    if (point.lng > maxLng) maxLng = point.lng
    if (point.lat < minLat) minLat = point.lat
    if (point.lat > maxLat) maxLat = point.lat
  }
  const n = (value: number) => value.toFixed(2)
  return {
    nw: `${n(maxLat)}°N  ${n(minLng)}°E`,
    ne: `${n(maxLat)}°N  ${n(maxLng)}°E`,
    sw: `${n(minLat)}°N  ${n(minLng)}°E`,
    se: `${n(minLat)}°N  ${n(maxLng)}°E`,
  }
})
</script>

<template>
  <div ref="host" class="host">
    <svg :viewBox="`0 0 ${size.w} ${size.h}`" role="img" aria-label="离线轨迹预览，按 GCJ-02 坐标把当前运单画在局部平面上">
      <rect class="field" :width="size.w" :height="size.h" />
      <line v-for="(line, index) in grid" :key="index" class="grid" :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" />
      <text class="caption" :x="size.w / 2" y="18" text-anchor="middle">离线轨迹预览 · 北向上</text>
      <text class="bound" x="8" y="34">{{ bounds.nw }}</text>
      <text class="bound" :x="size.w - 8" y="34" text-anchor="end">{{ bounds.ne }}</text>
      <text class="bound" x="8" :y="size.h - 8">{{ bounds.sw }}</text>
      <text class="bound" :x="size.w - 8" :y="size.h - 8" text-anchor="end">{{ bounds.se }}</text>
      <polyline class="track" :points="base" />
      <polyline class="traveled" :points="done" />
      <g v-for="marker in markers" :key="marker.index">
        <circle :cx="marker.x" :cy="marker.y" r="5.5" :class="marker.kind" />
        <text :x="marker.x + marker.dx" :y="marker.y + 4" :text-anchor="marker.anchor">{{ marker.text }}</text>
      </g>
      <g v-if="vehicle" :transform="`translate(${vehicle.x} ${vehicle.y}) rotate(${vehicle.bearing})`">
        <path class="veh" d="M0,-12 L7.5,9 L0,4.5 L-7.5,9 Z" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.host { position: relative; flex: 1; min-height: 0; }
svg { display: block; width: 100%; height: 100%; }
.field { fill: var(--color-mapArea); }
.grid { stroke: var(--color-track); stroke-width: 1; }
.caption { fill: var(--color-secondary); font-size: 12px; }
.bound { fill: var(--color-tertiary); font-size: 12px; font-family: var(--font-number); }
.track { fill: none; stroke: var(--color-barLight); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; opacity: 0.45; }
.traveled { fill: none; stroke: var(--color-accent); stroke-width: 4; stroke-linejoin: round; stroke-linecap: round; }
.origin { fill: var(--color-vehicle); }
.transfer, .stay { fill: var(--color-dwell); }
.destination { fill: var(--color-accent); }
text { fill: var(--color-text); font-size: 12px; font-family: var(--font-family); }
.veh { fill: var(--color-accent); stroke: var(--color-canvas); stroke-width: 1; }
</style>
