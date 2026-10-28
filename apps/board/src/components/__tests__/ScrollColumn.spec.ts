import { render } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'

import ScrollColumn from '../ScrollColumn.vue'
import { useSettingStore } from '@/stores/settings'

afterEach(() => vi.useRealTimers())

it('continuous scroll restarts from the top even if the content shrinks mid-scroll', async () => {
  vi.useFakeTimers()
  const pinia = createPinia()
  setActivePinia(pinia)
  const settings = useSettingStore()
  settings.scrollType = 'continues'
  settings.readLineTimeSeconds = 0.1 // 500 px/s

  let scrollHeight = 10_000 // e.g. placeholders, replaced by shorter tables later
  const scrollTops: number[] = []
  const proto = HTMLElement.prototype
  vi.spyOn(proto, 'clientHeight', 'get').mockReturnValue(500)
  vi.spyOn(proto, 'scrollHeight', 'get').mockImplementation(() => scrollHeight)
  let scrollTop = 0
  vi.spyOn(proto, 'scrollTop', 'get').mockImplementation(() => scrollTop)
  proto.scrollTo = vi.fn(function (this: HTMLElement, ...args: unknown[]) {
    const top =
      typeof args[0] === 'object' ? (args[0] as ScrollToOptions).top! : (args[1] as number)
    scrollTop = Math.min(Math.max(top, 0), scrollHeight - 500)
    scrollTops.push(scrollTop)
  }) as typeof proto.scrollTo

  render(ScrollColumn, { global: { plugins: [pinia] } })

  await vi.advanceTimersByTimeAsync(3000) // initial delay + some scrolling
  scrollHeight = 1_000 // content shrinks: bottom is reached now
  await vi.advanceTimersByTimeAsync(6000) // at most one page read pause

  // Reached the new bottom, then went back to the top instead of staying parked.
  const bottomAt = scrollTops.findIndex((top) => top >= 484)
  expect(bottomAt).toBeGreaterThan(-1)
  expect(scrollTops.slice(bottomAt)).toContain(0)
})
