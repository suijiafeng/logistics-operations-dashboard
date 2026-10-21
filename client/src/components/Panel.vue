<script setup lang="ts">
import { useDashboardStore } from '../stores/dashboard'
defineProps<{ title: string; extra?: string }>()
const store = useDashboardStore()
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="tick" />
      <h3>{{ title }}</h3>
      <span v-if="extra" class="extra" :title="extra">{{ extra }}</span>
    </header>
    <div class="panel-body" :class="{ pending: !store.hasData }" :aria-busy="store.dataStatus === 'loading'">
      <div class="panel-content" :inert="!store.hasData"><slot /></div>
      <p v-if="!store.hasData" class="placeholder">{{ store.dataStatus === 'error' ? '数据暂不可用，正在重试' : '正在加载数据…' }}</p>
    </div>
  </section>
</template>

<style scoped>
.panel {
  background: var(--color-panel);
  border: 1px solid var(--color-track);
  border-radius: var(--radius-panel);
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
/* 标题栏单行、高度固定：说明文字过长时省略，不换行挤压内容区 */
.panel-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4) 0;
  min-width: 0;
}
.panel-head .tick {
  width: 3px;
  height: 14px;
  background: var(--color-barLight);
  border-radius: 2px;
  flex: none;
}
.panel-head h3 {
  flex: none;
  font-size: var(--font-title);
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
}
.panel-head .extra {
  margin-left: auto;
  min-width: 0;
  font-size: var(--font-small);
  color: var(--color-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.panel-body {
  flex: 1;
  min-height: 0;
  padding: var(--space-3) var(--space-4) var(--space-3);
  display: flex;
  flex-direction: column;
  position: relative;
}
.panel-content { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.pending .panel-content { visibility: hidden; }
.placeholder { position: absolute; inset: var(--space-4); color: var(--color-secondary); font-size: var(--font-body); }
/* 矮屏（如 1366×768）：面板头部与内边距各收 8px，左列四个面板合计省出约 60px 给图表 */
@media (max-height: 820px) and (min-width: 1280px) {
  .panel-head { padding: 8px var(--space-3) 0; }
  .panel-head h3 { font-size: var(--font-body); }
  .panel-body { padding: 8px var(--space-3) 8px; }
}
</style>
