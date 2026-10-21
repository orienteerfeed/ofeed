import { ref, watchEffect, type Ref } from 'vue'
import {
  startWinnerCommentator,
  WINNER_UPDATED_SUBSCRIPTION,
  type Winner,
} from '@repo/commentator'
import { getWsClient } from '@/composables/providers/useOfeed'
import { useSettingStore } from '@/stores/settings'

const RESUBSCRIBE_DELAY_MS = 5000

/** Speaks leader changes of an OFeed event; one tab per event announces. */
export function useWinnerCommentator(
  eventId: Ref<string>,
  enabled: Ref<boolean>
) {
  const settingsStore = useSettingStore()
  const resubscribeTick = ref(0)

  watchEffect((onCleanup) => {
    void resubscribeTick.value
    const id = eventId.value
    if (!enabled.value || !id) return

    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const commentator = startWinnerCommentator(id)
    const unsubscribe = getWsClient().subscribe<{ winnerUpdated: Winner }>(
      { query: WINNER_UPDATED_SUBSCRIPTION, variables: { eventId: id } },
      {
        next({ data }) {
          const winner = data?.winnerUpdated
          // Only classes shown on this board; unordered classes are not a
          // ranking, so nobody leads them.
          if (
            winner &&
            settingsStore.categoriesDisplayByColumn.some((column) =>
              column.some((c) => c.name === winner.className)
            ) &&
            settingsStore.resolveCategorySettings(winner.className).resultMode ===
              'Default'
          )
            commentator.announce(winner)
        },
        error() {
          retryTimer = setTimeout(
            () => resubscribeTick.value++,
            RESUBSCRIBE_DELAY_MS
          )
        },
        complete() {},
      }
    )

    onCleanup(() => {
      clearTimeout(retryTimer)
      unsubscribe()
      commentator.stop()
    })
  })
}
