<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore, ALERT_STATUS_TEXT, isAlertOpen, type AlertStatus, type AnomalyEvent } from '../stores/dashboard'
import { useFocus } from '../services/useFocus'
import { hubById } from '../data/network'

const store = useDashboardStore()
const LEVEL_CLASS = ['lv0', 'lv1', 'lv2']
const LEVEL_TEXT = ['提醒', '警告', '严重']
// 处置流转：新建 → 已确认 → 处理中 → 已关闭；未关闭的都可直接关闭
const NEXT_STEP: Partial<Record<AlertStatus, { status: AlertStatus; label: string }>> = {
  open: { status: 'acked', label: '确认' },
  acked: { status: 'handling', label: '开始处理' },
  handling: { status: 'closed', label: '关闭' },
}
const stream = ref<HTMLDivElement | null>(null)
const sample = ref<HTMLLIElement | null>(null)
const capacity = ref(0)
let observer: ResizeObserver | undefined

const filtered = computed(() => store.alertFilter === 'pending' ? store.events.filter(isAlertOpen) : store.events)
const pendingCount = computed(() => store.events.filter(isAlertOpen).length)
// 展开处置按钮的行占两行高度：当前定位的告警在列表里时少放一条
const rows = computed(() => Math.max(0, capacity.value - (store.activeEvent && filtered.value.some((e) => e.id === store.activeEvent?.id) ? 1 : 0)))
const pinned = computed(() => {
  if (rows.value < 3) return undefined
  const latest = filtered.value.slice(0, rows.value)
  return filtered.value.find((event) => event.level === 2 && isAlertOpen(event) && !latest.some((item) => item.id === event.id))
})
const visibleEvents = computed(() => pinned.value
  ? [pinned.value, ...filtered.value.filter((event) => event.id !== pinned.value?.id).slice(0, rows.value - 1)]
  : filtered.value.slice(0, rows.value))
const stats = computed(() => {
  const s = store.alertStats
  if (!s) return ''
  const parts = [`待处理 ${s.open + s.acked + s.handling}`, `处理中 ${s.handling}`, `今日关闭 ${s.closedToday}`]
  if (s.avgHandleMin !== null) parts.push(`人工平均 ${s.avgHandleMin} 分`)
  return parts.join(' · ')
})

// 每条固定三行、单行省略，行高恒定，才能按容器高度准确算出可展示条数
// 用 offsetHeight 而非 getBoundingClientRect：后者在整页 zoom 下返回视觉尺寸，与 clientHeight 口径不一致
function measure() {
  const height = sample.value?.offsetHeight ?? 0
  if (height > 0 && stream.value) capacity.value = Math.max(0, Math.floor(stream.value.clientHeight / height))
}

// 定位后若地图不在视口内（窄屏），由统一入口滚回地图
const { locateEvent: locate } = useFocus()
function ownerName(event: AnomalyEvent) { return event.owner ? hubById[event.owner]?.name ?? event.owner : '' }
function act(event: AnomalyEvent, status: AlertStatus) { void store.setAlertStatus(event.id, status) }

// 新到的严重告警短暂高亮：首屏快照里的历史事件不算「新到」，避免一打开页面满屏闪
const FRESH_MS = 8000
const fresh = ref(new Set<number>())
const seen = new Set<number>()
const freshTimers = new Set<number>()
let primed = false
let engine = store.engineId
function resetFresh() {
  for (const t of freshTimers) window.clearTimeout(t)
  freshTimers.clear()
  seen.clear()
  fresh.value = new Set()
  primed = false
}
watch(() => store.events, (events) => {
  // 引擎重启后事件编号从头开始，旧编号不能再当「已见过」：去重集合、高亮与计时器一并重置，新引擎首批事件视作历史
  if (store.engineId !== engine) { engine = store.engineId; resetFresh() }
  if (!primed) {
    for (const e of events) seen.add(e.id)
    primed = store.hasData
    return
  }
  for (const e of events) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    if (e.level !== 2) continue
    fresh.value = new Set(fresh.value).add(e.id)
    const timer = window.setTimeout(() => {
      freshTimers.delete(timer)
      const next = new Set(fresh.value); next.delete(e.id); fresh.value = next
    }, FRESH_MS)
    freshTimers.add(timer)
  }
  if (seen.size > 500) for (const id of [...seen].slice(0, seen.size - 300)) seen.delete(id)
})

onMounted(() => {
  observer = new ResizeObserver(measure)
  if (stream.value) observer.observe(stream.value)
  if (sample.value) observer.observe(sample.value)
})
onBeforeUnmount(() => { observer?.disconnect(); resetFresh() })
</script>

<template>
  <Panel title="异常告警" :extra="stats || '全国 · 最新优先 · 点击定位'">
    <div class="toolbar">
      <div class="filters" role="group" aria-label="告警筛选">
        <button type="button" :class="{ on: store.alertFilter === 'pending' }" :aria-pressed="store.alertFilter === 'pending'" @click="store.alertFilter = 'pending'">待处理 {{ pendingCount }}</button>
        <button type="button" :class="{ on: store.alertFilter === 'all' }" :aria-pressed="store.alertFilter === 'all'" @click="store.alertFilter = 'all'">全部 {{ store.events.length }}</button>
      </div>
      <span class="hint">点击定位 · 定位后可处置</span>
    </div>
    <div ref="stream" class="stream">
      <p v-if="store.hasData && filtered.length === 0" class="empty">
        {{ store.alertFilter === 'pending' ? '暂无待处理告警。' : '本次连接暂无新事件。' }}
        <button v-if="store.alertFilter === 'pending'" type="button" class="reset" @click="store.alertFilter = 'all'">查看全部告警</button>
      </p>
      <!-- 显式时长：离场立即移除，否则高亮行的闪烁动画会被当作离场动画，被删掉的行残留数秒 -->
      <TransitionGroup name="evt" tag="ul" class="list" :duration="{ enter: 150, leave: 0 }">
        <li v-for="e in visibleEvents" :key="e.id" class="item" role="button" tabindex="0"
          :class="[`st-${e.status ?? 'open'}`, { active: store.activeEvent?.id === e.id, fresh: fresh.has(e.id), closed: e.status === 'closed' }]"
          :aria-label="`${LEVEL_TEXT[e.level] ?? '提醒'}，${e.type}，${e.vehicle}，${e.place}，${ALERT_STATUS_TEXT[e.status ?? 'open']}，责任网点${ownerName(e)}，${e.desc}，点击定位事件线路和发生位置`"
          :title="`${e.type} · ${e.vehicle} · ${e.time}\n${e.place} · 责任网点 ${ownerName(e)}\n${e.desc}\n状态：${ALERT_STATUS_TEXT[e.status ?? 'open']}${e.recoveredAt ? ' · 车辆已恢复' : ''}${e.closedBy ? ` · ${e.closedBy}` : ''}`"
          @click="locate(e)" @keydown.enter="locate(e)" @keydown.space.prevent="locate(e)">
          <i class="sev" :class="LEVEL_CLASS[e.level] ?? 'lv0'" />
          <div class="line1">
            <b>{{ e.type }}</b>
            <span class="vehicle">{{ e.vehicle }}</span>
            <span class="status" :class="`st-${e.status ?? 'open'}`">{{ ALERT_STATUS_TEXT[e.status ?? 'open'] }}</span>
            <span v-if="pinned?.id === e.id" class="pin">置顶</span>
            <time>{{ e.time }}</time>
          </div>
          <p class="place">{{ e.place }}<span v-if="ownerName(e)" class="owner"> · 责任 {{ ownerName(e) }}</span><span v-if="e.recoveredAt && e.status !== 'closed'" class="recovered"> · 车辆已恢复</span></p>
          <p class="desc">{{ e.desc }}</p>
          <div v-if="store.activeEvent?.id === e.id && e.status" class="actions" @click.stop @keydown.enter.stop @keydown.space.stop>
            <template v-if="e.status !== 'closed'">
              <button v-if="NEXT_STEP[e.status]" type="button" class="primary" :disabled="store.alertBusy.has(e.id)" @click="act(e, NEXT_STEP[e.status]!.status)">{{ NEXT_STEP[e.status]!.label }}</button>
              <button v-if="e.status !== 'handling'" type="button" :disabled="store.alertBusy.has(e.id)" @click="act(e, 'closed')">直接关闭</button>
              <span v-if="e.handler" class="by">{{ e.handler }}</span>
            </template>
            <span v-else class="by">{{ e.closedBy ? `${e.closedBy} 关闭` : '已关闭' }}</span>
          </div>
        </li>
      </TransitionGroup>
      <ul class="measure" aria-hidden="true"><li ref="sample" class="item">
        <i class="sev lv0" /><div class="line1"><b>车辆故障</b><span class="vehicle">粤A·10000</span><span class="status st-open">新建</span><time>00:00:00</time></div><p class="place">广州 → 深圳 · 责任 深圳</p><p class="desc">事件描述</p>
      </li></ul>
    </div>
  </Panel>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-2); }
.filters { display: flex; gap: 4px; }
.filters button {
  min-height: 26px;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-secondary);
  font-size: var(--font-small);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.filters button.on { background: var(--color-selected); border-color: var(--color-accent); color: var(--color-heading); }
.toolbar .hint { font-size: 12px; color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stream {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
.empty {
  color: var(--color-secondary);
  font-size: var(--font-body);
  padding: var(--space-2) var(--space-1);
}
.empty .reset {
  display: inline-flex;
  margin-left: 8px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-small);
  cursor: pointer;
}
.empty .reset:hover { background: var(--color-hover); }
.list { list-style: none; }
.measure { position: absolute; top: 0; left: 0; right: 0; visibility: hidden; pointer-events: none; list-style: none; }
.item {
  position: relative;
  padding: var(--space-2) var(--space-1) var(--space-2) 18px;
  border-bottom: 1px solid var(--color-track);
  border-radius: var(--radius-control);
  cursor: pointer;
  min-width: 0;
}
.item:hover { background: var(--color-hover); }
.item.active { background: var(--color-selected); }
.item.closed { opacity: 0.6; }
/* 新到严重告警：红底闪 3 次后保持淡红底，8 秒后恢复；减少动态效果时只保留静态淡红底 */
.item.fresh { background: rgba(240, 82, 77, 0.12); animation: severe-flash 1.2s ease-in-out 3; }
@keyframes severe-flash { 0%, 100% { background: rgba(240, 82, 77, 0.06); } 50% { background: rgba(240, 82, 77, 0.3); } }
/* 级别用标题前的小圆点表达，避免整列彩条抢视线 */
.sev { position: absolute; left: 6px; top: 15px; width: 6px; height: 6px; border-radius: 50%; }
.lv0 { background: var(--color-border); }
.lv1 { background: var(--color-warning); }
.lv2 { background: var(--color-danger); }
.line1 {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  min-width: 0;
  font-size: var(--font-body);
  line-height: 20px;
}
.line1 b {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 50%;
  color: var(--color-heading);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vehicle {
  flex: 0 1 auto;
  min-width: 0;
  font-family: var(--font-number);
  font-size: 13px;
  color: var(--color-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 状态标签：新建灰、已确认蓝、处理中琥珀（需要关注）、已关闭暗 */
.status { flex: none; padding: 0 6px; border-radius: 999px; font-size: 12px; line-height: 18px; background: var(--color-elevated); color: var(--color-secondary); }
.status.st-acked { background: var(--color-infoBg); color: var(--color-heading); }
.status.st-handling { background: rgba(246, 180, 64, 0.18); color: var(--color-warning); }
.status.st-closed { color: var(--color-tertiary); }
.pin { flex: none; font-size: 12px; color: var(--color-dangerText); }
time {
  flex: none;
  margin-left: auto;
  font-family: var(--font-number);
  font-size: var(--font-small);
  color: var(--color-tertiary);
  font-variant-numeric: tabular-nums;
}
.place, .desc {
  font-size: var(--font-small);
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.place { color: var(--color-secondary); }
.owner { color: var(--color-tertiary); }
.recovered { color: var(--color-success, #4cc38a); }
.desc { color: var(--color-tertiary); }
.actions { display: flex; align-items: center; gap: var(--space-2); margin-top: 6px; }
.actions button {
  min-height: 26px;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-canvas);
  color: var(--color-text);
  font-size: var(--font-small);
  cursor: pointer;
}
.actions button.primary { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-onAccent); font-weight: 500; }
.actions button:disabled { opacity: 0.5; cursor: default; }
.actions .by { font-size: 12px; color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.evt-enter-active { transition: opacity 150ms ease-out, transform 150ms ease-out; }
.evt-enter-from { opacity: 0; transform: translateY(-8px); }
/* 紧凑布局隐藏描述行，完整内容由整行悬停提示与 aria-label 提供 */
@media (max-height: 980px) {
  .desc { display: none; }
  .item { padding-block: var(--space-1); }
}
</style>
