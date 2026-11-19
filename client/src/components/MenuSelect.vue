<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
  ariaLabel: string
  placeholder?: string
  placement?: 'down' | 'up'
  plain?: boolean
}>(), { placement: 'down', plain: false })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const active = ref(0)
const root = ref<HTMLElement | null>(null)
const listId = `menu-${Math.random().toString(36).slice(2, 8)}`
const current = computed(() => props.options.find((option) => option.value === props.modelValue))
const buttonText = computed(() => current.value?.label || props.placeholder || '请选择')

function close() { open.value = false }

function toggle() {
  open.value = !open.value
  if (!open.value) return
  const index = props.options.findIndex((option) => option.value === props.modelValue)
  active.value = index >= 0 ? index : 0
}

function pick(value: string) {
  emit('update:modelValue', value)
  close()
}

function onKey(event: KeyboardEvent) {
  if (!open.value && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    toggle()
    return
  }
  if (!open.value) return
  if (event.key === 'Escape') { event.preventDefault(); close(); return }
  if (event.key === 'ArrowDown') { event.preventDefault(); active.value = Math.min(props.options.length - 1, active.value + 1) }
  if (event.key === 'ArrowUp') { event.preventDefault(); active.value = Math.max(0, active.value - 1) }
  if (event.key === 'Home') { event.preventDefault(); active.value = 0 }
  if (event.key === 'End') { event.preventDefault(); active.value = Math.max(0, props.options.length - 1) }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const option = props.options[active.value]
    if (option) pick(option.value)
  }
}

function onDoc(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close()
}

watch(open, (value) => {
  if (value) document.addEventListener('pointerdown', onDoc)
  else document.removeEventListener('pointerdown', onDoc)
})
watch(active, () => {
  const node = root.value?.querySelector<HTMLElement>('[data-active="true"]')
  node?.scrollIntoView({ block: 'nearest' })
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDoc))
</script>

<template>
  <div ref="root" class="menu-select" :class="{ plain, open }" @keydown="onKey">
    <button
      type="button"
      class="trigger"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-label="ariaLabel"
      :title="ariaLabel"
      @click="toggle"
    >{{ buttonText }}</button>
    <ul v-if="open" :id="listId" class="list" :class="placement" role="listbox" :aria-label="ariaLabel">
      <li v-for="(option, index) in options" :key="option.value">
        <button
          type="button"
          role="option"
          class="option"
          :aria-selected="option.value === modelValue"
          :data-active="index === active"
          :class="{ on: option.value === modelValue, active: index === active }"
          @mouseenter="active = index"
          @click="pick(option.value)"
        >{{ option.label }}</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.menu-select { position: relative; display: inline-flex; min-width: 0; max-width: 100%; }
.trigger {
  min-width: 0;
  max-width: 100%;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-canvas);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-small);
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trigger:hover { background: var(--color-hover); }
.plain .trigger {
  min-height: 0;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--color-tertiary);
  font-size: 13px;
}
.plain .trigger:hover { background: transparent; color: var(--color-heading); }
.list {
  position: absolute;
  z-index: 40;
  left: 0;
  min-width: 100%;
  max-width: 280px;
  max-height: 280px;
  margin: 0;
  padding: 4px;
  overflow: auto;
  list-style: none;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  box-shadow: var(--shadow-panel);
}
.list.down { top: calc(100% + 4px); }
.list.up { bottom: calc(100% + 4px); }
.option {
  display: block;
  width: 100%;
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-small);
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.option:hover, .option.active { background: var(--color-hover); }
.option.on { color: var(--color-accentText); }
</style>
