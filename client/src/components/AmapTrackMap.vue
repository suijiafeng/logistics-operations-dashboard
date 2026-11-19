<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DemoTrackPoint } from '../data/deliveryTracks'
import { readAmapConfig } from '../services/amapEnv'
import { extractAmapErrorCode } from '../services/amapErrors'
import { loadAmap } from '../services/amap'
import type { AMapMap, AMapMarker, AMapNamespace, AMapPolyline } from '../services/amapTypes'
import { COLORS, FONT } from '../design/tokens'
import { adminLabelsFromTree, normalizeDistricts, type RawDistrict } from '../services/adminLabels'
import { trackMarkers, type TrackMarker } from '../services/trackMarkers'
import { traveledPath, type PlaybackSample, type Stay } from '../services/trackGeometry'

const props = defineProps<{
  points: DemoTrackPoint[]
  stays: Stay[]
  pose: PlaybackSample | null
}>()
const emit = defineEmits<{ unavailable: [code?: string] }>()

const host = ref<HTMLElement | null>(null)
let alive = true
let amap: AMapNamespace | null = null
let map: AMapMap | null = null
let baseLine: AMapPolyline | null = null
let doneLine: AMapPolyline | null = null
let vehicle: AMapMarker | null = null
let pins: AMapMarker[] = []
let observer: ResizeObserver | undefined
let stopWatchingErrors: (() => void) | undefined

const DOT: Record<TrackMarker['kind'], string> = {
  origin: COLORS.vehicle,
  transfer: COLORS.dwell,
  destination: COLORS.accent,
  stay: COLORS.dwell,
}

function pinHtml(marker: TrackMarker) {
  return `<div style="position:relative;width:0;height:0;font:12px/1.2 ${FONT.family};color:${COLORS.text}">
    <span style="position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;background:${DOT[marker.kind]};box-shadow:0 0 0 2px ${COLORS.panel}"></span>
    <span style="position:absolute;left:10px;top:-9px;white-space:nowrap;background:${COLORS.overlay};border:1px solid ${COLORS.border};padding:1px 6px;border-radius:6px">${marker.text}</span>
  </div>`
}

const vehicleHtml = `<div style="position:relative;width:0;height:0">
  <svg width="22" height="22" viewBox="-11 -11 22 22" style="position:absolute;left:-11px;top:-11px">
    <path d="M0,-9 L6,7 L0,3 L-6,7 Z" fill="${COLORS.accent}" stroke="${COLORS.canvas}" stroke-width="1"></path>
  </svg>
</div>`

function lngLats(points: { lng: number; lat: number }[]) {
  return points.map((point) => [point.lng, point.lat])
}

function clearOverlays() {
  if (!map) return
  const overlays = [baseLine, doneLine, vehicle, ...pins].filter((item) => item)
  if (overlays.length) map.remove(overlays)
  baseLine = null
  doneLine = null
  vehicle = null
  pins = []
}

function drawStatic() {
  if (!map || !amap) return
  clearOverlays()
  baseLine = new amap.Polyline({
    path: lngLats(props.points),
    strokeColor: COLORS.barLight,
    strokeWeight: 5,
    strokeOpacity: 0.8,
    lineJoin: 'round',
    zIndex: 50,
  })
  doneLine = new amap.Polyline({
    path: lngLats(traveledPath(props.points, props.pose?.progress ?? 0)),
    strokeColor: COLORS.accent,
    strokeWeight: 6,
    lineJoin: 'round',
    zIndex: 60,
  })
  map.add(baseLine)
  map.add(doneLine)
  for (const marker of trackMarkers(props.points, props.stays)) {
    const pin = new amap.Marker({
      position: [marker.lng, marker.lat],
      anchor: 'center',
      content: pinHtml(marker),
      zIndex: 80,
    })
    pins.push(pin)
    map.add(pin)
  }
  const pose = props.pose
  const first = props.points[0]
  vehicle = new amap.Marker({
    position: [pose?.lng ?? first?.lng ?? 113.9, pose?.lat ?? first?.lat ?? 22.8],
    anchor: 'center',
    angle: pose?.bearing ?? 0,
    content: vehicleHtml,
    zIndex: 120,
  })
  map.add(vehicle)
  // 只在切换运单时适配视野，回放挪动车辆时不再缩放，避免进度条和视野抢
  map.setFitView([baseLine, ...pins], true, [48, 72, 40, 40])
}

/** 鉴权失败往往发生在脚本已经 load 成功之后。只把已知错误码交出去，不把带 key 的脚本地址写进日志。 */
function watchAuthErrors(onCode: (code: string) => void) {
  let stopped = false
  const report = (text: string) => {
    if (stopped) return
    const code = extractAmapErrorCode(text)
    if (code) onCode(code)
  }
  const origError = console.error
  const origWarn = console.warn
  console.error = (...args: unknown[]) => {
    report(args.map((item) => (item instanceof Error ? item.message : String(item))).join(' '))
    origError.apply(console, args)
  }
  console.warn = (...args: unknown[]) => {
    report(args.map((item) => (item instanceof Error ? item.message : String(item))).join(' '))
    origWarn.apply(console, args)
  }
  const onWindowError = (event: ErrorEvent) => report(event.message || '')
  window.addEventListener('error', onWindowError)
  const poll = window.setInterval(() => {
    if (host.value) report(host.value.innerText)
  }, 400)
  const giveUp = window.setTimeout(finish, 8_000)
  function finish() {
    if (stopped) return
    stopped = true
    console.error = origError
    console.warn = origWarn
    window.removeEventListener('error', onWindowError)
    window.clearInterval(poll)
    window.clearTimeout(giveUp)
  }
  return finish
}

interface DistrictSearchLike {
  search: (keyword: string, callback: (status: string, result: { districtList?: RawDistrict[] }) => void) => void
}

/** 深色底图的默认标注几乎看不见，而 features 的 point 会把商户 POI 一起打开。地名用行政区查询单独画。 */
function addAdminLabels(namespace: AMapNamespace, target: AMapMap) {
  const AMap = namespace as AMapNamespace & {
    plugin?: (name: string | string[], callback: () => void) => void
    DistrictSearch?: new (options: Record<string, unknown>) => DistrictSearchLike
    DistrictLayer?: { Province: new (options: Record<string, unknown>) => unknown }
    LabelsLayer?: new (options: Record<string, unknown>) => { add: (markers: unknown[]) => void }
    LabelMarker?: new (options: Record<string, unknown>) => unknown
  }
  const mark = (status: string) => { if (host.value) host.value.dataset.adminStatus = status }
  const place = () => {
    if (!alive) return
    if (!AMap.DistrictSearch || !AMap.LabelsLayer || !AMap.LabelMarker) { mark('api-missing'); return }
    if (AMap.DistrictLayer?.Province) {
      target.add(new AMap.DistrictLayer.Province({
        zIndex: 6,
        adcode: ['440000'],
        depth: 2,
        styles: {
          fill: 'rgba(0, 0, 0, 0)',
          'province-stroke': 'rgba(126, 176, 240, 0.40)',
          'city-stroke': 'rgba(126, 176, 240, 0.28)',
          'county-stroke': 'rgba(126, 176, 240, 0.16)',
          'stroke-width': 1,
        },
      }))
    }
    const search = (subdistrict: number, onLabels: (labels: ReturnType<typeof adminLabelsFromTree>) => void) => {
      const finder = new AMap.DistrictSearch!({
        level: 'province',
        subdistrict,
        extensions: 'base',
        showbiz: false,
      })
      finder.search('广东省', (status, result) => {
        if (!alive) return
        if (status !== 'complete') {
          mark(status || 'search-failed')
          if (subdistrict > 2) search(2, onLabels)
          return
        }
        onLabels(adminLabelsFromTree(normalizeDistricts(result.districtList)))
      })
    }
    mark('searching')
    search(3, (labels) => {
      if (!alive || !host.value) return
      if (!labels.length) { mark('empty'); return }
      const layer = new AMap.LabelsLayer!({ zooms: [3, 20], zIndex: 12, collision: true, allowCollision: false })
      layer.add(labels.map((label) => new AMap.LabelMarker!({
        name: label.name,
        position: label.position,
        zooms: label.zooms,
        rank: label.rank,
        zIndex: 12,
        text: {
          content: label.name,
          direction: 'center',
          style: {
            fontSize: label.fontSize,
            fillColor: COLORS.text,
            strokeColor: COLORS.canvas,
            strokeWidth: 2,
            fontWeight: label.rank >= 200 ? 'bold' : 'normal',
          },
        },
      })))
      target.add(layer)
      host.value.dataset.adminLabels = labels.map((label) => label.name).join(' ')
      mark(`placed-${labels.length}`)
    })
  }
  try {
    if (AMap.plugin) AMap.plugin('AMap.DistrictSearch', place)
    else place()
  } catch { mark('plugin-failed') }
}

function fail(code?: string) {
  if (!alive) return
  alive = false
  stopWatchingErrors?.()
  console.warn('高德地图不可用，改用离线轨迹', code || '加载失败')
  emit('unavailable', code)
}

function moveVehicle() {
  if (!doneLine || !vehicle || !props.pose) return
  doneLine.setPath(lngLats(traveledPath(props.points, props.pose.progress)))
  vehicle.setPosition([props.pose.lng, props.pose.lat])
  vehicle.setAngle(props.pose.bearing)
}

onMounted(() => {
  const config = readAmapConfig()
  if (!config.enabled) { emit('unavailable'); return }
  stopWatchingErrors = watchAuthErrors((code) => fail(code))
  void loadAmap(config).then((namespace) => {
    if (!alive || !host.value) return
    amap = namespace
    const first = props.points[0]
    // 底色、道路和 POI 标注。楼块和室内图继续关。行政区名和区界另由 DistrictLayer / 行政区查询补上。
    // 已行驶段用强调蓝，未行驶段用浅蓝，在官方 darkblue 上对比更清楚。不用 3D、路况或卫星图层。
    map = new namespace.Map(host.value, {
      viewMode: '2D',
      zoom: 11,
      center: [first?.lng ?? 113.9, first?.lat ?? 22.8],
      mapStyle: 'amap://styles/darkblue',
      features: ['bg', 'road', 'point'],
      showLabel: true,
      showBuildingBlock: false,
      showIndoorMap: false,
      resizeEnable: true,
    })
    const style = 'amap://styles/darkblue'
    const styled = map as AMapMap & { setMapStyle?: (style: string) => void; on?: (event: string, handler: () => void) => void }
    const applyStyle = () => styled.setMapStyle?.(style)
    applyStyle()
    styled.on?.('complete', applyStyle)
    drawStatic()
    addAdminLabels(namespace, map)
    observer = new ResizeObserver(() => map?.resize())
    observer.observe(host.value)
  }).catch((error) => {
    const code = extractAmapErrorCode(error instanceof Error ? error.message : String(error ?? ''))
    fail(code ?? undefined)
  })
})

watch(() => props.points, () => { if (map) drawStatic() })
watch(() => props.pose, () => { if (map) moveVehicle() })

onBeforeUnmount(() => {
  alive = false
  stopWatchingErrors?.()
  observer?.disconnect()
  map?.destroy()
  map = null
})
</script>

<template>
  <div ref="host" class="host" role="img" aria-label="高德地图上的配送轨迹" />
</template>

<style scoped>
.host { flex: 1; min-height: 0; min-width: 0; }
</style>
