<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'
import { useFocus } from '../services/useFocus'
import { GUANGDONG_HUB_IDS } from '../data/network'
import { HIGH_UTILIZATION } from '../design/tokens'
import { fmtInt } from '../services/format'

const store = useDashboardStore()
const { focusHub } = useFocus()
// 使用行政归属，避免包围盒把外省网点误纳入；按利用率降序，版面放不下时隐藏利用率最低的
const gdHubs = computed(() =>
  store.hubs
    .filter((h) => GUANGDONG_HUB_IDS.has(h.id))
    .sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0)),
)
const grid = ref<HTMLElement | null>(null)
const columns = ref(5)
let observer: ResizeObserver | undefined
const MIN_TILE = 104
const GAP = 8
function measure() {
  const w = grid.value?.clientWidth ?? 0
  if (w > 0) columns.value = Math.max(1, Math.floor((w + GAP) / (MIN_TILE + GAP)))
}
const visible = computed(() => gdHubs.value.slice(0, columns.value * 2))
const extra = computed(() => {
  const shown = Math.min(visible.value.length, gdHubs.value.length)
  const count = shown < gdHubs.value.length ? `显示 ${shown}/${gdHubs.value.length}` : `${gdHubs.value.length} 个网点`
  return `${count} · ≥${HIGH_UTILIZATION}% 高负载`
})
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (grid.value) observer.observe(grid.value)
  measure()
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <Panel title="广东仓配利用率" :extra="extra">
    <ul ref="grid" class="tiles" :style="{ '--cols': columns }">
      <li v-for="h in visible" :key="h.id" class="tile"
        :class="{ hot: (h.utilization ?? 0) >= HIGH_UTILIZATION, selected: h.id === store.selectedHubId }"
        role="button" tabindex="0" :aria-pressed="h.id === store.selectedHubId"
        :title="`${h.name} · 利用率 ${h.utilization ?? 0}% · 积压 ${fmtInt(h.backlog)} 件`"
        :aria-label="`${h.name}，利用率 ${h.utilization ?? 0}%，${(h.utilization ?? 0) >= HIGH_UTILIZATION ? '高负载' : '正常'}，积压 ${h.backlog ?? 0} 件`"
        @click="focusHub(h.id)" @keydown.enter="focusHub(h.id)" @keydown.space.prevent="focusHub(h.id)">
        <div class="body">
          <div class="top">
            <span class="name">{{ h.name }}</span>
            <span class="val">{{ h.utilization ?? 0 }}%</span>
          </div>
          <span class="backlog"><em v-if="(h.utilization ?? 0) >= HIGH_UTILIZATION">高负载</em><span class="count"><template v-if="(h.utilization ?? 0) >= HIGH_UTILIZATION"> · </template>积压 {{ fmtInt(h.backlog) }} 件</span></span>
        </div>
      </li>
    </ul>
  </Panel>
</template>

<style scoped>
.tiles {
  list-style: none;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.tile {
  container-type: size;
  min-width: 0;
  padding: 0 10px;
  border-radius: var(--radius-tile);
  background: var(--color-elevated);
  border: 1px solid transparent;
  cursor: pointer;
}
.tile:hover { background: var(--color-hover); }
.tile.hot { border-color: rgba(240, 82, 77, 0.7); }
.tile.selected { border-color: var(--color-accent); }
.body { height: 100%; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
.top { display: flex; align-items: baseline; gap: var(--space-1); min-width: 0; line-height: 20px; }
.name { min-width: 0; font-size: var(--font-small); color: var(--color-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.val {
  flex: none;
  font-family: var(--font-number);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-heading);
  font-variant-numeric: tabular-nums;
}
.hot .val { color: var(--color-danger); }
.backlog { min-width: 0; font-size: 11px; line-height: 14px; color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.backlog em { font-style: normal; color: var(--color-dangerText); }
/* 「高负载」是状态文字，任何高度都保留（不只靠红框表达告警）；可隐藏的只有积压数，
   积压数仍在 aria-label 与悬停提示中。两行放不下时高负载方块改为单行：利用率后直接跟状态文字 */
@container (max-height: 35px) {
  .count { display: none; }
  .tile:not(.hot) .backlog { display: none; }
  .hot .body { flex-direction: row; align-items: center; justify-content: flex-start; gap: var(--space-1); }
  .hot .top { flex: 0 1 auto; }
  .hot .backlog { flex: none; }
}
</style>
