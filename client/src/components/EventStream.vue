<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'
import { GUANGDONG_HUB_IDS } from '../data/network'
import { EVENT_ROW_HEIGHT } from '../design/tokens'

const store = useDashboardStore()
const LEVEL_CLASS = ['lv0', 'lv1', 'lv2']
const LEVEL_TEXT = ['提醒', '警告', '严重']
const stream = ref<HTMLDivElement | null>(null)
const capacity = ref(0)
let observer: ResizeObserver | undefined
const visibleEvents = computed(() => [...store.events]
  .sort((a, b) => b.level - a.level || b.id - a.id).slice(0, capacity.value))

function locate(place: string) {
  const destination = place.split('→').at(-1)?.trim()
  const hub = store.hubs.find((h) => h.name === destination)
  if (!hub) return
  store.setView(GUANGDONG_HUB_IDS.has(hub.id) ? 'guangdong' : 'china')
  store.selectHub(hub.id)
}

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    capacity.value = Math.max(0, Math.floor(entry.contentRect.height / EVENT_ROW_HEIGHT))
  })
  if (stream.value) observer.observe(stream.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <Panel title="实时异常事件" extra="严重优先 · 点击定位">
    <div ref="stream" class="stream">
      <p v-if="store.hasData && store.events.length === 0" class="empty">本次连接暂无新事件。</p>
      <TransitionGroup name="evt" tag="ul" class="list">
        <li v-for="e in visibleEvents" :key="e.id" class="item" role="button" tabindex="0"
          :aria-label="`${e.type}，${e.place}，点击定位目的网点`"
          @click="locate(e.place)" @keydown.enter="locate(e.place)" @keydown.space.prevent="locate(e.place)">
          <span class="badge" :class="LEVEL_CLASS[e.level]">{{ LEVEL_TEXT[e.level] }}</span>
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
}
.item {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-1);
  border-bottom: 1px dashed var(--color-track);
  height: var(--event-row-height);
  cursor: pointer;
}
.item:hover { background: var(--color-track); }
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
</style>
