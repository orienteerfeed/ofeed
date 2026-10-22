import { watchEffect, type Ref } from 'vue'
import {
  startWinnerCommentator,
  WINNER_UPDATED_SUBSCRIPTION,
  type Winner,
} from '@repo/commentator'
import { subscribeWithRetry } from '@/composables/providers/useOfeed'
import { useSettingStore } from '@/stores/settings'

/** Speaks leader changes of an OFeed event; one tab per event announces. */
export function useWinnerCommentator(
  eventId: Ref<string>,
  enabled: Ref<boolean>
) {
  const settingsStore = useSettingStore()

  watchEffect((onCleanup) => {
    const id = eventId.value
    if (!enabled.value || !id) return

    const commentator = startWinnerCommentator(id)
    const unsubscribe = subscribeWithRetry<{ winnerUpdated: Winner }>(
      { query: WINNER_UPDATED_SUBSCRIPTION, variables: { eventId: id } },
      (data) => {
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
      }
    )

    onCleanup(() => {
      unsubscribe()
      commentator.stop()
    })
  })
}
