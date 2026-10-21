<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore, type AnomalyEvent } from '../stores/dashboard'

const store = useDashboardStore()
const LEVEL_CLASS = ['lv0', 'lv1', 'lv2']
const LEVEL_TEXT = ['提醒', '警告', '严重']
const stream = ref<HTMLDivElement | null>(null)
const sample = ref<HTMLLIElement | null>(null)
const capacity = ref(0)
let observer: ResizeObserver | undefined
const pinned = computed(() => {
  if (capacity.value < 3) return undefined
  const latest = store.events.slice(0, capacity.value)
  return store.events.find((event) => event.level === 2 && !latest.some((item) => item.id === event.id))
})
const visibleEvents = computed(() => pinned.value
  ? [pinned.value, ...store.events.filter((event) => event.id !== pinned.value?.id).slice(0, capacity.value - 1)]
  : store.events.slice(0, capacity.value))

// 每条固定三行、单行省略，行高恒定，才能按容器高度准确算出可展示条数
// 用 offsetHeight 而非 getBoundingClientRect：后者在整页 zoom 下返回视觉尺寸，与 clientHeight 口径不一致
function measure() {
  const height = sample.value?.offsetHeight ?? 0
  if (height > 0 && stream.value) capacity.value = Math.max(0, Math.floor(stream.value.clientHeight / height))
}

// 窄屏下告警列表在地图下方：定位后若地图不在视口内，滚回地图，让定位结果与详情卡可见
function locate(event: AnomalyEvent) {
  store.locateEvent(event)
  const map = document.querySelector('.map-wrap')
  if (!map) return
  const rect = map.getBoundingClientRect()
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches && store.decorationsOn
    map.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
  }
}

onMounted(() => {
  observer = new ResizeObserver(measure)
  if (stream.value) observer.observe(stream.value)
  if (sample.value) observer.observe(sample.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <Panel title="异常告警" extra="全国 · 最新优先 · 点击定位">
    <div ref="stream" class="stream">
      <p v-if="store.hasData && store.events.length === 0" class="empty">本次连接暂无新事件。</p>
      <TransitionGroup name="evt" tag="ul" class="list">
        <li v-for="e in visibleEvents" :key="e.id" class="item" role="button" tabindex="0" :class="{ active: store.activeEvent?.id === e.id }"
          :aria-label="`${LEVEL_TEXT[e.level] ?? '提醒'}，${e.type}，${e.vehicle}，${e.place}，${e.desc}，点击定位事件线路和发生位置`"
          :title="`${e.type} · ${e.vehicle} · ${e.time}\n${e.place}\n${e.desc}`"
          @click="locate(e)" @keydown.enter="locate(e)" @keydown.space.prevent="locate(e)">
          <i class="sev" :class="LEVEL_CLASS[e.level] ?? 'lv0'" />
          <div class="line1">
            <b>{{ e.type }}</b>
            <span class="vehicle">{{ e.vehicle }}</span>
            <span v-if="pinned?.id === e.id" class="pin">置顶</span>
            <time>{{ e.time }}</time>
          </div>
          <p class="place">{{ e.place }}</p>
          <p class="desc">{{ e.desc }}</p>
        </li>
      </TransitionGroup>
      <ul class="measure" aria-hidden="true"><li ref="sample" class="item">
        <i class="sev lv0" /><div class="line1"><b>车辆故障</b><span class="vehicle">粤A·10000</span><time>00:00:00</time></div><p class="place">广州 → 深圳</p><p class="desc">事件描述</p>
      </li></ul>
    </div>
  </Panel>
</template>

<style scoped>
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
  max-width: 60%;
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
.pin { flex: none; font-size: 11px; color: var(--color-dangerText); }
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
.desc { color: var(--color-tertiary); }
.evt-enter-active { transition: all 0.35s ease; }
.evt-enter-from { opacity: 0; transform: translateY(-8px); }
/* 紧凑布局隐藏描述行，完整内容由整行悬停提示与 aria-label 提供 */
@media (max-height: 980px) {
  .desc { display: none; }
  .item { padding-block: var(--space-1); }
}
</style>
