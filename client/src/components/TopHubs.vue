<script setup lang="ts">
import { computed } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const max = computed(() => {
  const t = store.topHubs[0]
  return t ? Math.max(1, (t.arrivals ?? 0) + (t.departures ?? 0)) : 1
})
</script>

<template>
  <Panel title="网点吞吐 TOP5" extra="到车 + 发车">
    <ul class="list">
      <li v-for="(h, i) in store.topHubs" :key="h.id" class="interactive-row" :class="{ selected: h.id === store.selectedHubId }"
        role="button" tabindex="0" :aria-pressed="h.id === store.selectedHubId"
        @click="store.selectHub(h.id)" @keydown.enter="store.selectHub(h.id)" @keydown.space.prevent="store.selectHub(h.id)">
        <span class="rank">{{ i + 1 }}</span>
        <span class="name">{{ h.name }}</span>
        <span class="bar">
          <span
            class="fill"
            :style="{ width: `${(((h.arrivals ?? 0) + (h.departures ?? 0)) / max) * 100}%` }"
          />
        </span>
        <span class="val">{{ ((h.arrivals ?? 0) + (h.departures ?? 0)).toLocaleString('zh-CN') }}</span>
      </li>
    </ul>
  </Panel>
</template>

<style scoped>
.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  flex: 1;
}
li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-1);
  cursor: pointer;
  border-radius: var(--radius-control);
}
li:hover {
  background: var(--color-hover);
}
li.selected { background: var(--color-selected); box-shadow: inset 2px 0 var(--color-accent); }
.rank {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-control);
  background: var(--color-track);
  color: var(--color-accentText);
  font-size: var(--font-small);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.name {
  width: 40px;
  font-size: var(--font-body);
  color: var(--color-text);
  flex: none;
}
.bar {
  flex: 1;
  height: 8px;
  background: var(--color-track);
  border-radius: var(--radius-control);
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-control);
  transition: width 0.6s ease;
}
.val {
  width: 58px;
  text-align: right;
  font-size: var(--font-body);
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}
</style>
