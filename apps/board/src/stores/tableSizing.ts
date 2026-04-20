import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useTableSizingStore = defineStore('tableSizing', () => {
  // TODO recalc on resize - user scaling
  const _lineHeight = ref(50) // Taken from the css
  const mode = ref<'single' | 'relay'>('single')
  const lineHeight = computed(
    () => _lineHeight.value * (mode.value === 'relay' ? 4 : 1)
  )

  return {
    lineHeight,
    mode,
  }
})
