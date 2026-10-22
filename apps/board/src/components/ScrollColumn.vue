<script lang="ts" setup>
import { ref, toRef, watch, computed, onMounted } from 'vue'
import type { Ref } from 'vue'
import { useIntervalFn } from '@vueuse/core'

import { useScrollColumn } from '@/composables/scrollColumn/useScrollColumn'
import { useSettingStore } from '@/stores/settings'
import { useTableSizingStore } from '@/stores/tableSizing'

const settingsStore = useSettingStore()
const tableSizing = useTableSizingStore()

const {
  columnWrapper,
  columnWrapperRect,
  getNextItemOnPage,
  getNextItemBelowPage,
  checkItemsVisibility,
} = useScrollColumn(toRef(settingsStore, 'scrollType'))

const linesNumber = computed(() => {
  if (!columnWrapperRect.value) return 0
  return Math.floor(columnWrapperRect.value.height / tableSizing.lineHeight)
})
const visiblePageReadInMS = computed(
  () => Math.min(linesNumber.value * settingsStore.readLineTimeMS || 1000, 5000)
)

let activeScroll: null | Function = null
let pageScrolls: { [type: string]: ReturnType<typeof useIntervalFn> } = {}
const scrollTypesSetups = {
  page: setupPageScroll,
  row: setupRowScroll,
  continues: setupContinuesScroll,
}

// Set up initial scroll after mount so columnWrapperRect has real dimensions,
// avoiding a useIntervalFn restart that would delay the first scroll by up to 15 s.
onMounted(() => {
  checkItemsVisibility()
  const type = settingsStore.scrollType
  if (type !== 'none') {
    activeScroll = scrollTypesSetups[type]()
  }
})

// For continuous scroll, restart immediately from current position on speed change.
// Page/row use a reactive useIntervalFn interval so they update automatically.
watch(
  () => settingsStore.readLineTimeMS,
  () => {
    if (settingsStore.scrollType !== 'continues' || !activeScroll) return
    activeScroll()
    activeScroll = null
    const isCancelled = ref(false)
    activeScroll = () => { isCancelled.value = true }
    scrollContinuously(isCancelled)
  }
)

watch(
  () => settingsStore.scrollType,
  (type) => {
    if (activeScroll) {
      activeScroll()
      activeScroll = null
    }
    if (type !== 'none') {
      activeScroll = scrollTypesSetups[type]()
    }
  }
)

function isColumnBottom() {
  const wrapper = columnWrapper.value
  if (!wrapper) return true
  return wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 16
}

function isColumnTop() {
  if (!columnWrapper.value) return true
  return columnWrapper.value.scrollTop <= 0
}

function scrollColumnToTop() {
  columnWrapper.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollDownBy(
  getNextItem: typeof getNextItemBelowPage | typeof getNextItemOnPage
) {
  const nextItem = getNextItem()
  if (!nextItem) {
    checkItemsVisibility()
    return
  }
  if (nextItem.nextSubItem) {
    const nextItemRect = nextItem.nextSubItem.getBoundingClientRect()
    const stickyHeaderHeight = nextItem.item.stickyRef.value?.offsetHeight || 0
    const scrollY =
      nextItemRect.top - columnWrapperRect.value.top - stickyHeaderHeight
    columnWrapper.value?.scrollBy({ top: scrollY, behavior: 'smooth' })
  } else {
    const rect = nextItem.item.elementRef.value.getBoundingClientRect()
    const scrollY = rect.top - columnWrapperRect.value.top
    columnWrapper.value?.scrollBy({ top: scrollY, behavior: 'smooth' })
  }
}
const scrollDownByPage = () => scrollDownBy(getNextItemBelowPage)
const scrollDownByRow = () => scrollDownBy(getNextItemOnPage)
const scrollDownByType = {
  page: scrollDownByPage,
  row: scrollDownByRow,
}

let lastTickScrollTop: number | undefined
function scrollBy(
  scrollDownByFn: typeof scrollDownByPage | typeof scrollDownByRow
) {
  if (isColumnTop()) checkItemsVisibility() // BugFix after scrolltop visibility is sometimes off, Improve in useSC?
  const scrollTop = columnWrapper.value?.scrollTop
  // Restart also when the previous tick could not move the column (no next
  // item found), otherwise the board stays frozen at the end.
  if (isColumnBottom() || scrollTop === lastTickScrollTop) {
    lastTickScrollTop = undefined
    scrollColumnToTop()
  } else {
    lastTickScrollTop = scrollTop
    scrollDownByFn()
  }
}

function setupPageScrollSkeleton(
  type: 'page' | 'row',
  interval: Parameters<typeof useIntervalFn>[1]
) {
  const pageScrollInterval =
    pageScrolls[type] ??
    useIntervalFn(() => scrollBy(scrollDownByType[type]), interval)
  if (!pageScrolls[type]) pageScrolls[type] = pageScrollInterval
  if (!pageScrollInterval.isActive.value) pageScrollInterval.resume()
  return pageScrollInterval.pause
}

function setupPageScroll() {
  return setupPageScrollSkeleton('page', visiblePageReadInMS)
}

function setupRowScroll() {
  return setupPageScrollSkeleton('row', () => settingsStore.readLineTimeMS)
}

function setupContinuesScroll() {
  const isCancelled = ref(false)
  const cancel = () => (isCancelled.value = true)
  startContinuesScroll(isCancelled)
  return cancel
}

function startContinuesScroll(isCancelled: Ref<boolean>) {
  window.setTimeout(() => {
    if (isCancelled.value) return
    scrollContinuously(isCancelled)
  }, visiblePageReadInMS.value / 2)
}

// Constant speed, end detected live: content height changes while scrolling
// (tables loading, refetches), so a precomputed end would leave the column
// parked at the bottom until the stale duration runs out.
function scrollContinuously(isCancelled: Ref<boolean>) {
  const wrapper = columnWrapper.value
  if (!wrapper) return
  // Own position: per-frame steps are sub-pixel and scrollTop would round them away.
  let position = wrapper.scrollTop
  let lastTime: number | null = null

  const loop = (currentTime: DOMHighResTimeStamp) => {
    if (isCancelled.value) return
    if (lastTime !== null)
      position +=
        ((currentTime - lastTime) * tableSizing.lineHeight) /
        settingsStore.readLineTimeMS
    lastTime = currentTime
    wrapper.scrollTo(0, position)

    if (!isColumnBottom()) {
      window.requestAnimationFrame(loop)
      return
    }
    window.setTimeout(() => {
      if (isCancelled.value) return
      scrollColumnToTop()
      startContinuesScroll(isCancelled)
    }, visiblePageReadInMS.value)
  }
  window.requestAnimationFrame(loop)
}
</script>

<template>
  <div class="flex-1 overflow-y-scroll columnWrapper" ref="columnWrapper">
    <div><slot></slot></div>
  </div>
</template>

<style>
.columnWrapper::-webkit-scrollbar {
  width: 0;
}
</style>
