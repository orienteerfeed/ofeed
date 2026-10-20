import { ref, watchEffect, type Ref } from 'vue'
import {
  startWinnerCommentator,
  WINNER_UPDATED_SUBSCRIPTION,
  type Winner,
} from '@repo/commentator'
import { getWsClient } from '@/composables/providers/useOfeed'

const RESUBSCRIBE_DELAY_MS = 5000

/** Speaks leader changes of an OFeed event; one tab per event announces. */
export function useWinnerCommentator(
  eventId: Ref<string>,
  enabled: Ref<boolean>
) {
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
          if (data?.winnerUpdated) commentator.announce(data.winnerUpdated)
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
