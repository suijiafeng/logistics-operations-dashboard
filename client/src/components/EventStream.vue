<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'

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

function measure() {
  const height = sample.value?.getBoundingClientRect().height ?? 0
  if (height > 0 && stream.value) capacity.value = Math.max(0, Math.floor((stream.value.clientHeight + 4) / (height + 4)))
}

onMounted(() => {
  observer = new ResizeObserver(measure)
  if (stream.value) observer.observe(stream.value)
  if (sample.value) observer.observe(sample.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <Panel title="实时异常事件" extra="全国 · 最新优先">
    <div ref="stream" class="stream">
      <p v-if="store.hasData && store.events.length === 0" class="empty">本次连接暂无新事件。</p>
      <TransitionGroup name="evt" tag="ul" class="list">
        <li v-for="e in visibleEvents" :key="e.id" class="item" role="button" tabindex="0" :class="{ active: store.activeEvent?.id === e.id }"
          :aria-label="`${e.type}，${e.place}，${e.desc}，点击定位事件线路和发生位置`"
          @click="store.locateEvent(e)" @keydown.enter="store.locateEvent(e)" @keydown.space.prevent="store.locateEvent(e)">
          <span class="badge" :class="LEVEL_CLASS[e.level]">{{ pinned?.id === e.id ? '关注' : LEVEL_TEXT[e.level] }}</span>
          <div class="main">
            <div class="line1">
              <b>{{ e.type }}</b>
              <span class="vehicle">{{ e.vehicle }}</span>
              <time>{{ e.time }}</time>
            </div>
            <p class="place" :title="e.place">{{ e.place }}</p>
            <p class="desc" :title="e.desc">{{ e.desc }}</p>
          </div>
        </li>
      </TransitionGroup>
      <ul class="measure" aria-hidden="true"><li ref="sample" class="item">
        <span class="badge">提醒</span><div class="main"><div class="line1"><b>车辆故障</b><span class="vehicle">粤A·10000</span><time>00:00:00</time></div><p class="place">广州 → 深圳</p><p class="desc">事件描述</p></div>
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
.list {
  list-style: none;
  display: grid;
  gap: 4px;
}
.measure { position: absolute; top: 0; left: 0; right: 0; visibility: hidden; pointer-events: none; list-style: none; }
.item {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-1);
  border-bottom: 1px dashed var(--color-track);
  border-radius: var(--radius-control);
  cursor: pointer;
}
.item:hover { background: var(--color-track); }
.item.active { background: var(--color-selected); }
.badge {
  flex: none;
  height: 20px;
  padding: 0 var(--space-2);
  border-radius: 3px;
  font-size: var(--font-small);
  line-height: 20px;
  font-weight: 600;
  white-space: nowrap;
}
.lv0 { background: var(--color-infoBg); color: var(--color-secondary); }
.lv1 { background: var(--color-warningBg); color: var(--color-warning); }
.lv2 { background: var(--color-dangerBg); color: var(--color-dangerText); }
.main {
  flex: 1;
  min-width: 0;
}
.line1 {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  font-size: var(--font-body);
}
.line1 b {
  color: var(--color-heading);
  font-weight: 600;
  white-space: nowrap;
  flex: none;
}
.vehicle {
  color: var(--color-accentText);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex: none;
}
.place {
  color: var(--color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--font-small);
  line-height: 18px;
}
time {
  margin-left: auto;
  color: var(--color-secondary);
  font-size: var(--font-small);
  font-variant-numeric: tabular-nums;
  flex: none;
}
.desc {
  font-size: var(--font-small);
  color: var(--color-secondary);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 16px;
}
.evt-enter-active {
  transition: all 0.35s ease;
}
.evt-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
@media (max-height: 980px) {
  .desc { display: none; }
  .item { padding-block: var(--space-1); }
}
</style>
