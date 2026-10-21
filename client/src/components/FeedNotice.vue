<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const message = computed(() => {
  if (store.dataStatus === 'loading') return '正在加载首批数据，指标暂不展示。'
  if (store.dataStatus === 'error') return '数据加载失败，指标暂不可用，系统将自动重试。'
  return '数据已过期，当前保留最后一次有效数据，请勿作为实时状态使用。'
})
</script>

<template>
  <div v-if="store.dataStatus !== 'ready'" class="feed-notice"
    :class="store.dataStatus" :role="store.dataStatus === 'error' ? 'alert' : 'status'">
    <strong>{{ message }}</strong>
    <span v-if="store.connectionError">{{ store.connectionError }}</span>
    <span v-else-if="store.dataStatus === 'stale'">超过 5 秒未收到有效更新或实时连接中断。</span>
  </div>
</template>

<style scoped>
.feed-notice {
  display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4);
  padding: var(--space-2) var(--space-4); border-radius: var(--radius-panel);
  background: var(--color-infoBg); color: var(--color-text); font-size: var(--font-small);
  overflow-wrap: anywhere;
}
.feed-notice strong { font-weight: 600; }
.error { background: var(--color-dangerBg); color: var(--color-dangerText); }
.stale { background: var(--color-warningBg); color: var(--color-warning); }
</style>
