<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Panel from './Panel.vue'
import OdSankey, { OD_TOP } from './OdSankey.vue'
import SafetyRank from './SafetyRank.vue'
import ColdChain from './ColdChain.vue'
import { useDashboardStore } from '../stores/dashboard'
import { fmtCompact } from '../services/format'
import { linkedRouteName, waybillById } from '../data/deliveryTracks'
import WaybillEfficiencyChart from './WaybillEfficiencyChart.vue'

// 右下页签面板：省际 OD 流向 / 司机安全 / 冷链监控；轮播开启且无人操作时每 10 秒轮换页签
const TABS = [
  { key: 'od', label: 'OD 流向', title: '省际 OD 流向' },
  { key: 'safety', label: '司机安全', title: '司机安全' },
  { key: 'cold', label: '冷链监控', title: '冷链监控' },
  { key: 'efficiency', label: '运输效率', title: '运输效率' },
]
type TabKey = 'od' | 'safety' | 'cold' | 'efficiency'
const store = useDashboardStore()
const active = ref<TabKey>('od')
const title = computed(() => TABS.find((t) => t.key === active.value)?.title ?? '')
const extra = computed(() => {
  if (active.value === 'od') {
    const s = store.shipments
    if (!s) return '发出省 → 到达省'
    const flows = s.od.slice(0, OD_TOP)
    const inter = Math.max(0, s.odTotal - s.odIntra)
    const shown = flows.reduce((sum, f) => sum + f.value, 0)
    return `省际前 ${flows.length} 对 · 占省际 ${inter ? Math.round(shown / inter * 100) : 0}% · 省内另有 ${fmtCompact(s.odIntra)} 单`
  }
  if (active.value === 'safety') {
    const s = store.safety
    return s ? `100 分起扣 · 超速 -2 急刹 -1 疲劳 -5 · 今日 ${s.flagged} 人扣分 · 点击追踪` : '100 分起扣'
  }
  if (active.value === 'efficiency') {
    const waybill = waybillById(store.selectedWaybillId)
    return waybill ? `演示数据 · 已联动「${linkedRouteName(waybill.routeIndex)}」` : '演示数据 · 点选高亮干线'
  }
  const c = store.cold
  return c ? `占车队 ${store.vehicleCount ? Math.round(c.count / store.vehicleCount * 100) : 0}% · 越界 1℃ 持续 30 秒告警 · 点击看曲线` : '温度 10 秒一采'
})
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => {
    if (!store.tourOn || store.tourPaused || document.hidden) return
    const i = TABS.findIndex((t) => t.key === active.value)
    active.value = TABS[(i + 1) % TABS.length]!.key as TabKey
  }, 10_000)
})
onBeforeUnmount(() => window.clearInterval(timer))
// 追踪冷链车时自动切到冷链页签，追踪扣分司机时切到安全页签（仅用户未在手动切换时）
watch(() => store.selectedWaybillId, (id) => {
  if (id) active.value = 'efficiency'
}, { immediate: true })
watch(() => store.selectedPlate, (plate) => {
  if (!plate) return
  if (store.cold?.over.some((o) => o.plate === plate)) active.value = 'cold'
  else if (store.safety?.worst.some((d) => d.plate === plate)) active.value = 'safety'
})
</script>

<template>
  <Panel :title="title" :extra="extra" :tabs="TABS" :active="active" @update:active="active = $event as TabKey">
    <OdSankey v-if="active === 'od'" />
    <SafetyRank v-else-if="active === 'safety'" />
    <ColdChain v-else-if="active === 'cold'" />
    <WaybillEfficiencyChart v-else />
  </Panel>
</template>

<style scoped>
/* 窄列里四个页签放不下时换行，不把「运输效率」挤出标题栏 */
:deep(.tabs) { flex-wrap: wrap; max-width: 100%; }
</style>
