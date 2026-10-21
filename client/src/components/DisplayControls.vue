<script setup lang="ts">
import { useDashboardStore } from '../stores/dashboard'
const store = useDashboardStore()
function changeQuality(event: Event) {
  const value = (event.target as HTMLSelectElement).value
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
  <details class="display-controls">
    <summary>大屏设置</summary>
    <div class="menu">
      <button @click="toggleFullscreen">{{ store.fullscreen ? '退出全屏' : '进入全屏' }}（F）</button>
      <button :aria-pressed="store.tourOn" @click="store.tourOn = !store.tourOn">轮播：{{ store.tourOn ? store.tourPaused ? '操作暂停 · 空闲 30 秒恢复' : '运行中' : '关闭' }}</button>
      <button :aria-pressed="store.kioskOn" @click="store.kioskOn = !store.kioskOn">播控模式：{{ store.kioskOn ? '开' : '关' }}</button>
      <span v-if="store.kioskOn">{{ store.wakeStatus }} · 空闲 3 秒隐藏鼠标</span>
      <label>画质 <select :value="store.autoQuality ? 'auto' : store.quality" @change="changeQuality">
        <option value="auto">自动（当前 {{ store.quality }}）</option><option value="full">完整</option><option value="balanced">均衡</option><option value="low">低负载</option>
      </select></label>
      <span>轮播只展示仿真数据；人工操作优先。</span>
    </div>
  </details>
</template>
<style scoped>
.display-controls { position: relative; text-align: left; }
summary { cursor: pointer; min-height: 32px; padding: 4px 8px; border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-text); }
summary:focus-visible { outline: 2px solid var(--color-accentText); }
.menu { position: absolute; right: 0; top: 40px; width: 288px; display: grid; gap: 8px; padding: 12px; background: var(--color-panel); border: 1px solid var(--color-border); z-index: 100; box-shadow: 0 8px 24px #0008; }
button, select { background: var(--color-canvas); color: var(--color-text); border: 1px solid var(--color-border); padding: 6px; border-radius: 4px; cursor: pointer; }
span { font-size: 12px; color: var(--color-muted); white-space: normal; }
</style>
