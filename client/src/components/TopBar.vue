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
  if (store.connectionState === 'connected') return `${base} · 延迟 ${store.latencyMs}ms`
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

    <div class="title-zone">
      <span class="wing l" aria-hidden="true"><i /><i /><i /></span>
      <div class="tab">
        <svg class="chev" viewBox="0 0 40 16" aria-hidden="true">
          <path d="M2 3L8 8L2 13" class="faint" /><path d="M12 3L18 8L12 13" class="mid" /><path d="M31 4L35 8L31 12L27 8Z" class="dot" />
        </svg>
        <h1 title="全国干线物流运行监控">全国干线物流运行监控</h1>
        <svg class="chev" viewBox="0 0 40 16" aria-hidden="true">
          <path d="M9 4L13 8L9 12L5 8Z" class="dot" /><path d="M28 3L22 8L28 13" class="mid" /><path d="M38 3L32 8L38 13" class="faint" />
        </svg>
      </div>
      <span class="wing r" aria-hidden="true"><i /><i /><i /></span>
    </div>

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
  border: 1px solid var(--color-track);
  border-radius: var(--radius-panel);
  position: relative;
  overflow: hidden;
}
.side { display: flex; align-items: center; gap: var(--space-3); min-width: 0; position: relative; z-index: 2; }
.side.right { justify-content: flex-end; gap: var(--space-6); }
.sim-tag {
  flex: none;
  font-size: var(--font-small);
  color: var(--color-secondary);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 0 var(--space-2);
  line-height: 20px;
}
.entry {
  flex: none;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: transparent;
  color: var(--color-accentText);
  font-size: var(--font-small);
  cursor: pointer;
}

/* ---- 标题区装饰 ---- */
.title-zone { position: relative; height: 56px; display: flex; align-items: center; justify-content: center; }
.tab {
  position: relative;
  height: 56px;
  padding: 0 64px 6px;
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.tab::before { /* 梯形底托 */
  content: '';
  position: absolute;
  inset: -1px 0 6px;
  clip-path: polygon(0 0, 100% 0, calc(100% - 30px) 100%, 30px 100%);
  background: linear-gradient(180deg, rgba(18, 48, 90, 0.95), rgba(14, 29, 56, 0.6));
}
.tab::after { /* 底托亮线 + 光晕 */
  content: '';
  position: absolute;
  left: 30px;
  right: 30px;
  bottom: 5px;
  height: 1.5px;
  background: var(--color-barLight);
  box-shadow: 0 0 14px 2px rgba(91, 166, 238, 0.45);
}
h1 {
  position: relative;
  max-width: min(calc(var(--vw, 1vw) * 36), 640px);
  font-size: var(--font-page);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-heading);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chev { position: relative; width: 40px; height: 16px; flex: none; }
.chev path { fill: none; stroke: var(--color-barLight); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.chev .faint { stroke-opacity: 0.35; }
.chev .mid { stroke-opacity: 0.7; }
.chev .dot { fill: var(--color-barLight); stroke: none; }
/* 两侧翼线：从标题向外渐隐，末端三道斜条 */
.wing {
  position: absolute;
  bottom: 6px;
  width: clamp(0px, calc(var(--vw, 1vw) * 24 - 80px), 460px);
  height: 12px;
  pointer-events: none;
}
.wing.l { right: calc(100% - 30px); background: linear-gradient(to left, rgba(91, 166, 238, 0.8), transparent) bottom / 100% 1px no-repeat; }
.wing.r { left: calc(100% - 30px); background: linear-gradient(to right, rgba(91, 166, 238, 0.8), transparent) bottom / 100% 1px no-repeat; }
.wing i { position: absolute; bottom: 0; width: 10px; height: 12px; background: var(--color-barLight); }
.wing.l i { right: calc(var(--i) * 18px + 6px); transform: skewX(-30deg); }
.wing.r i { left: calc(var(--i) * 18px + 6px); transform: skewX(30deg); }
.wing i:nth-child(1) { --i: 0; opacity: 0.9; }
.wing i:nth-child(2) { --i: 1; opacity: 0.6; }
.wing i:nth-child(3) { --i: 2; opacity: 0.3; }

/* ---- 右侧状态 ---- */
.status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  max-width: 260px;
  padding: 3px var(--space-3) 3px 10px;
  border-radius: 12px;
  background: var(--color-elevated);
  font-size: var(--font-small);
  color: var(--color-secondary);
}
.status-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--color-secondary); }
.status.wait .dot { background: var(--color-warning); animation: pulse 1.6s infinite; }
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
@keyframes pulse { 50% { opacity: 0.35; } }

@media (max-width: 1599px) {
  .topbar { padding-inline: var(--space-4); }
  .side.right { gap: var(--space-4); }
  h1 { font-size: var(--font-compactPage); }
}
@media (max-width: 1279px) {
  .wing { display: none; }
  .date { display: none; }
  .tab { padding-inline: 44px; }
}
@media (max-width: 767px) {
  .topbar { height: auto; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'title title' 'left right'; row-gap: 0; padding: 0 var(--space-3) var(--space-2); }
  .title-zone { grid-area: title; }
  .side.left { grid-area: left; }
  .side.right { grid-area: right; }
  .chev { display: none; }
  .tab { padding-inline: 36px; }
  h1 { font-size: var(--font-title); max-width: calc(var(--vw, 1vw) * 100 - 120px); }
  .clock { font-size: var(--font-title); }
}
</style>
