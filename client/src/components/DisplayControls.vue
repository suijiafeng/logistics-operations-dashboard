<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { useMediaQuery } from '../services/useMediaQuery'
import MenuSelect from './MenuSelect.vue'
const store = useDashboardStore()
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const qualityOptions = computed(() => [
  { value: 'auto', label: `自动（当前 ${store.quality}）` },
  { value: 'full', label: '完整' },
  { value: 'balanced', label: '均衡' },
  { value: 'low', label: '低负载' },
])
function changeQuality(value: string) {
  store.autoQuality = value === 'auto'
  if (value === 'full' || value === 'balanced' || value === 'low') store.quality = value
  store.qualityReason = store.autoQuality ? '自动画质已启用' : '手动画质'
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch { store.notify('无法切换全屏，请使用浏览器全屏功能（F11）') }
}
</script>
<template>
  <!-- 播控类操作收进低调的设置入口：值班大屏常态无人操作，不让控件占用画面 -->
  <details class="display-controls">
    <summary aria-label="大屏设置">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
    </summary>
    <div class="menu">
      <button @click="toggleFullscreen">{{ store.fullscreen ? '退出全屏' : '进入全屏' }}（F）</button>
      <button :aria-pressed="store.tourOn" @click="store.tourOn = !store.tourOn">轮播：{{ store.tourOn ? store.tourPaused ? '操作暂停 · 空闲 30 秒恢复' : '运行中' : '关闭' }}</button>
      <button :aria-pressed="store.kioskOn" @click="store.kioskOn = !store.kioskOn">播控模式：{{ store.kioskOn ? '开' : '关' }}</button>
      <span v-if="store.kioskOn">{{ store.wakeStatus }} · 空闲 3 秒隐藏鼠标</span>
      <button :aria-pressed="store.hudOn" @click="store.toggleHud()">性能 HUD：{{ store.hudOn ? '开' : '关' }}（H）</button>
      <button :aria-pressed="store.decorationsOn && !reducedMotion" :disabled="reducedMotion"
        @click="store.decorationsOn = !store.decorationsOn">{{ reducedMotion ? '系统已减少动态效果' : `装饰动效：${store.decorationsOn ? '开' : '关'}` }}</button>
      <label class="quality">画质
        <MenuSelect :model-value="store.autoQuality ? 'auto' : store.quality" ariaLabel="画质" :options="qualityOptions" @update:model-value="changeQuality" />
      </label>
      <span>轮播只展示仿真数据；人工操作优先。</span>
    </div>
  </details>
</template>
<style scoped>
.display-controls { position: relative; text-align: left; flex: none; }
summary {
  list-style: none;
  display: grid;
  place-items: center;
  width: var(--control-size);
  height: var(--control-size);
  border-radius: var(--radius-control);
  color: var(--color-tertiary);
  cursor: pointer;
}
summary::-webkit-details-marker { display: none; }
summary:hover, details[open] summary { background: var(--color-hover); color: var(--color-secondary); }
summary:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
summary svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; }
.menu { position: fixed; left: var(--space-6); top: 64px; width: 288px; display: grid; gap: 8px; padding: 12px; background: var(--color-panel); border: 1px solid var(--color-border); border-radius: var(--radius-panel); z-index: 100; box-shadow: var(--shadow-panel); }
button { background: var(--color-canvas); color: var(--color-text); border: 1px solid var(--color-border); padding: 6px; border-radius: var(--radius-control); cursor: pointer; text-align: left; }
button:disabled { color: var(--color-tertiary); cursor: default; }
label { font-size: var(--font-small); color: var(--color-secondary); display: flex; align-items: center; gap: var(--space-2); }
.quality { min-width: 0; }
span { font-size: 12px; color: var(--color-tertiary); white-space: normal; }
</style>
