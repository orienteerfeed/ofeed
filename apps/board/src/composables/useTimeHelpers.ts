import { createSharedComposable, useNow } from '@vueuse/core'
import { computed } from 'vue'

export const useTimeHelpers = createSharedComposable(_useTimeHelpers)

function _useTimeHelpers() {
  const timeFormatter = new Intl.DateTimeFormat('default', {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  })
  function startTimeFormatter(date: Date | undefined, timezone?: string): string {
    if (!date) return ''
    return new Intl.DateTimeFormat('default', {
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date)
  }
  const dateTimeFormatter = new Intl.DateTimeFormat('default', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })

  const now = useNow({ interval: 500 })
  const now5s = useNow({ interval: 5000 })
  const nowFormatted = computed(() => timeFormatter.format(now.value))

  return { dateTimeFormatter, timeFormatter, startTimeFormatter, now, now5s, nowFormatted }
}
