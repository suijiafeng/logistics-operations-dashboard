<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'
import { GUANGDONG_HUB_IDS } from '../data/network'

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
    capacity.value = Math.max(0, Math.floor(entry.contentRect.height / 72))
  })
  if (stream.value) observer.observe(stream.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <Panel title="实时异常事件" extra="严重优先 · 点击定位">
    <div ref="stream" class="stream">
      <p v-if="store.events.length === 0" class="empty">暂无异常事件，等待模拟引擎推送…</p>
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
  color: #8fa3b8;
  font-size: 13px;
  padding: 8px 4px;
}
.list {
  list-style: none;
}
.item {
  display: flex;
  gap: 9px;
  padding: 7px 4px;
  border-bottom: 1px dashed #16222d;
  height: 72px;
  cursor: pointer;
}
.item:hover { background: #16202a; }
.badge {
  flex: none;
  height: 20px;
  padding: 0 7px;
  border-radius: 3px;
  font-size: 11px;
  line-height: 20px;
  font-weight: 600;
  white-space: nowrap;
}
.lv0 { background: #233242; color: #9db4c9; }
.lv1 { background: #4a3a17; color: #eec27a; }
.lv2 { background: #57201d; color: #ff9d97; }
.main {
  flex: 1;
  min-width: 0;
}
.line1 {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
}
.line1 b {
  color: #eef4fa;
  font-weight: 600;
  white-space: nowrap;
  flex: none;
}
.vehicle {
  color: #ffb066;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex: none;
}
.place {
  color: #7e93a8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  line-height: 18px;
}
time {
  margin-left: auto;
  color: #8fa3b8;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  flex: none;
}
.desc {
  font-size: 12px;
  color: #8fa3b8;
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
