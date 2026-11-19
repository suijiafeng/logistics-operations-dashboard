<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import DisplayControls from './DisplayControls.vue'

// 顶栏只承载标识、时间与连接状态，不放业务数据（数据集中在下方面板，避免信息过密）
const store = useDashboardStore()
const STATUS_TEXT = {
  connecting: '正在连接数据服务',
  connected: '实时',
  reconnecting: '实时数据重连中',
  error: '数据服务暂不可用',
  idle: '数据连接已停止',
}
const now = ref(new Date())
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => (now.value = new Date()), 1000)
})
onBeforeUnmount(() => window.clearInterval(timer))

const statusText = computed(() => {
  if (store.dataStatus === 'stale') return '数据已过期'
  const base = STATUS_TEXT[store.connectionState]
  if (store.connectionState === 'connected') return `${base} · 延迟 ${store.latencyMs} ms`
  return store.reconnectAttempt ? `${base}（第 ${store.reconnectAttempt} 次）` : base
})
const statusTone = computed(() => store.dataStatus === 'ready' ? 'ok'
  : store.dataStatus === 'stale' || store.connectionState === 'connecting' || store.connectionState === 'reconnecting' ? 'wait' : 'off')
const time = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }))
const date = computed(() => now.value.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Shanghai' }))
</script>

<template>
  <header class="topbar">
    <div class="side left">
      <span class="sim-tag" title="页面数据由自研模拟引擎生成，非真实业务数据">仿真数据</span>
      <button type="button" class="entry" title="查看演示运单的配送轨迹" @click="store.openDelivery()">配送轨迹</button>
      <DisplayControls />
    </div>

    <h1 title="全国干线物流运行监控">全国干线物流运行监控</h1>

    <div class="side right">
      <span class="status" :class="statusTone" :title="store.connectionError || statusText">
        <span class="dot" /><span class="status-text">{{ statusText }}</span>
      </span>
      <span class="date">{{ date }}</span>
      <time class="clock">{{ time }}</time>
    </div>
  </header>
</template>

<style scoped>
/* 三栏：左右等宽，标题永远居中；两侧内容过长时各自省略，不挤占标题 */
.topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-4);
  height: 56px;
  padding: 0 var(--space-6);
  background: var(--color-header);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}
.side { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.side.right { justify-content: flex-end; gap: var(--space-6); }
.sim-tag {
  flex: none;
  font-size: var(--font-small);
  color: var(--color-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: 0 var(--space-2);
  line-height: 22px;
}
.entry {
  flex: none;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-small);
  cursor: pointer;
}
.entry:hover { background: var(--color-hover); }
h1 {
  max-width: min(calc(var(--vw, 1vw) * 36), 640px);
  font-size: var(--font-page);
  font-weight: 600;
  letter-spacing: normal;
  color: var(--color-heading);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  max-width: 280px;
  padding: 3px var(--space-3) 3px 10px;
  border-radius: 999px;
  background: var(--color-elevated);
  font-size: var(--font-small);
  color: var(--color-secondary);
  font-variant-numeric: tabular-nums;
}
.status-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--color-secondary); }
.status.ok .dot { background: var(--color-accent); }
.status.wait .dot { background: var(--color-warning); }
.status.off { color: var(--color-dangerText); }
.status.off .dot { background: var(--color-danger); }
.date { flex: none; font-size: 13px; color: var(--color-tertiary); white-space: nowrap; }
.clock {
  flex: none;
  font-family: var(--font-number);
  font-size: 22px;
  font-weight: 600;
  color: var(--color-heading);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1599px) {
  .topbar { padding-inline: var(--space-4); }
  .side.right { gap: var(--space-4); }
  h1 { font-size: var(--font-compactPage); }
}
@media (max-width: 1279px) {
  .date { display: none; }
}
@media (max-width: 767px) {
  .topbar { height: auto; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'title title' 'left right'; row-gap: 0; padding: 8px var(--space-3) var(--space-2); }
  h1 { grid-area: title; justify-self: center; font-size: var(--font-title); max-width: calc(var(--vw, 1vw) * 100 - 32px); }
  .side.left { grid-area: left; }
  .side.right { grid-area: right; }
  .clock { font-size: var(--font-title); }
}
</style>
