<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { useMediaQuery } from '../services/useMediaQuery'
import DisplayControls from './DisplayControls.vue'

const store = useDashboardStore()
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const STATUS_TEXT = {
  connecting: '正在连接数据服务',
  connected: '实时数据已连接',
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

function fmt(n: number) {
  return store.hasData ? n.toLocaleString('zh-CN') : '—'
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <div class="logo">运</div>
      <div class="titles">
        <h1>智慧物流数据可视化监控平台</h1>
        <p>全国干线网实时运行总览 · 全国指标口径</p>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <span class="kpi-label">全国在途车辆</span>
        <span class="kpi-value">{{ fmt(store.kpi.enRoute) }}<small>台</small></span>
      </div>
      <div class="kpi">
        <span class="kpi-label">全国今日运单</span>
        <span class="kpi-value">{{ fmt(store.kpi.ordersToday) }}<small>单</small></span>
      </div>
      <div class="kpi">
        <span class="kpi-label">全国准时率</span>
        <span class="kpi-value">{{ store.hasData ? store.kpi.onTimeRate.toFixed(1) : '—' }}<small>%</small></span>
      </div>
      <div class="kpi alert">
        <span class="kpi-label">全国待处理异常</span>
        <span class="kpi-value">{{ fmt(store.kpi.pendingAnomalies) }}<small>起</small></span>
      </div>
    </div>

    <div class="meta">
      <div class="clock">
        {{ now.toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) }}
        <span class="date">{{ now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Shanghai' }) }}</span>
      </div>
      <div class="status" :title="store.connectionError || undefined">
        <span class="dot" :class="{ off: store.dataStatus !== 'ready', waiting: store.dataStatus === 'stale' || store.connectionState === 'connecting' || store.connectionState === 'reconnecting' }" />
        {{ store.dataStatus === 'stale' ? '数据已过期' : STATUS_TEXT[store.connectionState] }}
        <span v-if="store.reconnectAttempt">（第 {{ store.reconnectAttempt }} 次）</span>
        <span class="sim">自研引擎 · 仿真数据</span>
      </div>
      <div class="tools">
        <DisplayControls />
        <span class="updated">{{ store.dataAt ? `更新 ${new Date(store.dataAt).toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })}` : '等待首包数据' }}</span>
        <button class="hud-btn" :aria-pressed="store.hudOn" :class="{ on: store.hudOn }" @click="store.toggleHud()">性能 HUD</button>
        <button class="hud-btn" :aria-pressed="store.decorationsOn && !reducedMotion" :disabled="reducedMotion"
          @click="store.decorationsOn = !store.decorationsOn">{{ reducedMotion ? '已减少动态效果' : store.decorationsOn ? '关闭装饰动效' : '开启动效' }}</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-2) var(--space-4);
  min-height: 88px;
  background: var(--color-header);
}
.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: none;
}
.logo {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-panel);
  background: var(--color-accent);
  color: var(--color-onAccent);
  font-size: var(--font-page);
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.titles h1 {
  font-size: var(--font-page);
  font-weight: 700;
  letter-spacing: 0;
  color: var(--color-heading);
  white-space: nowrap;
}
.titles p {
  font-size: var(--font-small);
  color: var(--color-secondary);
  letter-spacing: 3px;
  margin-top: 1px;
}
.kpis {
  display: flex;
  gap: var(--space-6);
  margin: 0 auto;
}
.kpi {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.kpi-label {
  font-size: var(--font-small);
  color: var(--color-secondary);
  letter-spacing: 2px;
}
.kpi-value {
  font-size: var(--font-kpi);
  font-weight: 700;
  color: var(--color-accentValue);
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.kpi-value small {
  font-size: var(--font-body);
  color: var(--color-secondary);
  margin-left: var(--space-1);
  font-weight: 400;
}
.kpi.alert .kpi-value {
  color: var(--color-dangerText);
}
.meta {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1);
}
.clock {
  font-size: var(--font-title);
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}
.clock .date {
  font-size: var(--font-small);
  color: var(--color-secondary);
  margin-left: var(--space-2);
  font-weight: 400;
}
.status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-small);
  color: var(--color-secondary);
}
.status .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
  animation: pulse 1.6s infinite;
}
.status .dot.off {
  background: var(--color-danger);
  animation: none;
}
.status .dot.waiting {
  background: var(--color-warning);
  animation: pulse 1.6s infinite;
}
.status .sim {
  color: var(--color-secondary);
  margin-left: var(--space-2);
}
@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.35; }
  100% { opacity: 1; }
}
.hud-btn {
  margin-top: var(--space-1);
  background: var(--color-track);
  color: var(--color-secondary);
  border: none;
  border-radius: var(--radius-control);
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-small);
  cursor: pointer;
}
.hud-btn.on {
  background: var(--color-accent);
  color: var(--color-onAccent);
  font-weight: 600;
}
.tools { display: flex; align-items: center; gap: var(--space-3); }
.updated { font-size: var(--font-small); color: var(--color-secondary); font-variant-numeric: tabular-nums; }
.hud-btn:hover { background: var(--color-hover); }
.hud-btn.on:hover { background: var(--color-accentText); color: var(--color-onAccent); }
.hud-btn:disabled { color: var(--color-secondary); cursor: default; }
@media (max-width: 1599px) {
  .topbar { gap: var(--space-4); padding-inline: var(--space-3); }
  .titles h1 { font-size: var(--font-compactPage); }
  .titles p { letter-spacing: 0; }
  .kpis { gap: var(--space-4); }
  .sim { display: none; }
  .titles p::after { content: ' · 仿真数据'; }
}
@media (max-width: 1279px) {
  .topbar { flex-wrap: wrap; }
  .brand { width: 100%; }
  .kpis { flex: 1; margin: 0; }
}
@media (max-width: 767px) {
  .topbar { padding: var(--space-3); }
  .titles h1 { font-size: var(--font-title); white-space: normal; }
  .kpis { width: 100%; flex: auto; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
  .kpi-value { font-size: var(--font-page); }
  .kpi-label { letter-spacing: 0; }
  .meta { width: 100%; align-items: flex-start; }
  .tools { flex-wrap: wrap; }
}
</style>
