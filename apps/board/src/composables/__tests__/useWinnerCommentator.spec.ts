import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick, ref } from 'vue'
import { useWinnerCommentator } from '../useWinnerCommentator'
import { useSettingStore } from '@/stores/settings'

const { start, stop, unsubscribe } = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  unsubscribe: vi.fn(),
}))
vi.mock('@repo/commentator', () => ({
  startWinnerCommentator: start,
  WINNER_UPDATED_SUBSCRIPTION: 'winner',
}))
vi.mock('@/composables/providers/useOfeed', () => ({
  subscribeWithRetry: () => unsubscribe,
}))

it('joins only selected ranked classes and updates elections when eligibility changes', async () => {
  start.mockReturnValue({ announce: vi.fn(), stop })
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useSettingStore()
  store.setAvailableCategories(['H21', 'D21', 'Open'])
  store.updateCategorySource('Open', { resultMode: 'Unordered' })
  const enabled = ref(true)
  const view = mount(
    defineComponent({
      setup: () => useWinnerCommentator(ref('event'), enabled),
      template: '<div />',
    }),
    { global: { plugins: [pinia] } }
  )
  expect(start).toHaveBeenLastCalledWith('event', ['H21', 'D21'])
  store.setCategorySelected(store.categoriesDisplay[0]!, false)
  await nextTick()
  expect(stop).toHaveBeenCalled()
  expect(start).toHaveBeenLastCalledWith('event', ['D21'])
  enabled.value = false
  await nextTick()
  expect(unsubscribe).toHaveBeenCalledTimes(start.mock.calls.length)
  view.unmount()
})
