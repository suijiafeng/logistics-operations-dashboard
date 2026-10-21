<script setup lang="ts">
import { computed } from 'vue'
import Panel from './Panel.vue'
import RankRow from './RankRow.vue'
import { useDashboardStore } from '../stores/dashboard'
import { useFocus } from '../services/useFocus'

const store = useDashboardStore()
const { focusHub } = useFocus()
const total = (h: { arrivals?: number; departures?: number }) => (h.arrivals ?? 0) + (h.departures ?? 0)
const max = computed(() => Math.max(1, ...store.topHubs.map(total)))
</script>

<template>
  <Panel title="网点吞吐 TOP5" extra="到车 + 发车 · 点击查看">
    <ul class="list">
      <li v-for="(h, i) in store.topHubs" :key="h.id">
        <RankRow :rank="i + 1" :name="h.name" :value="total(h)" :max="max"
          class="interactive-row" :class="{ selected: h.id === store.selectedHubId }"
          role="button" tabindex="0" :aria-pressed="h.id === store.selectedHubId"
          @click="focusHub(h.id)" @keydown.enter="focusHub(h.id)" @keydown.space.prevent="focusHub(h.id)" />
      </li>
    </ul>
  </Panel>
</template>

<style scoped>
.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  min-height: 0;
  --rank-name-width: 7em;
}
.list :deep(.rank-row) { cursor: pointer; }
@media (max-height: 820px) { .list { --rank-row-height: 22px; } }
</style>
