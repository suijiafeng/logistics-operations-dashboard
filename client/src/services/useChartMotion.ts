import { computed } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { useMediaQuery } from './useMediaQuery'

export function useChartMotion() {
  const store = useDashboardStore()
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  return computed(() => store.decorationsOn && !reduced.value)
}
