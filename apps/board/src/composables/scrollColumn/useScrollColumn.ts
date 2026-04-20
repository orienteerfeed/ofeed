import { ref, computed, provide, inject, onMounted, shallowRef } from 'vue'
import type { Ref, InjectionKey } from 'vue'
import { useEventListener, useDebounceFn } from '@vueuse/core'

import type { ScrollType } from '@/types/layout'

export type RegisterScrollColumnItem = (item: ScrollColumnItem) => void
export const registerScrollColumnItemKey =
  Symbol() as InjectionKey<RegisterScrollColumnItem>

interface ScrollColumnItem {
  id: string
  elementRef: Ref<HTMLElement>
  stickyRef: Ref<HTMLElement | null>
  contentRef: Ref<HTMLElement | null>
  isActive: Ref<boolean>
}

interface VisibleItem {
  item: ScrollColumnItem
  isVisible: boolean
  isFirstItem: boolean
  subItemsVisible?: number[]
  subItemsLength?: number
}

export function useScrollColumn(scrollType: Ref<ScrollType>) {
  const columnWrapper = ref<HTMLElement | null>(null)
  // TODO - reactive on resize
  const columnWrapperRect = computed(() => {
    if (!columnWrapper.value) return { top: 0, height: 100, bottom: 100 } // Placeholder until columnWrapper is set
    return columnWrapper.value.getBoundingClientRect()
  })
  const columnItems: ScrollColumnItem[] = []
  let activeItems: ScrollColumnItem[] = []
  const visibleItems = shallowRef<{
    [itemId: string]: VisibleItem
  }>({})

  const scrollDebounceMaxWait = computed(() =>
    scrollType.value === 'none' || scrollType.value === 'continues' ? 250 : 1000
  )
  const onScrollDebounced = useDebounceFn(
    () => {
      checkColumnItemsActivity()
    },
    100,
    { maxWait: scrollDebounceMaxWait }
  )
  useEventListener(columnWrapper, 'scroll', onScrollDebounced)

  const registerScrollColumnItem: RegisterScrollColumnItem = (item) => {
    columnItems.push(item)
    onScrollDebounced()
  }
  provide(registerScrollColumnItemKey, registerScrollColumnItem)

  function checkColumnItemsActivity() {
    activeItems = []
    // TODO - cache active items and check only around those
    for (const item of columnItems) {
      const isActiveAfterUpdate = isElementActive(item.elementRef.value)
      if (isActiveAfterUpdate !== item.isActive.value) {
        item.isActive.value = isActiveAfterUpdate
      }
      if (isActiveAfterUpdate) activeItems.push(item)
    }
    checkItemsVisibility()
  }

  // ColumnItem is considered active if its part of the visible area of the column or one col height below
  function isElementActive(element: HTMLElement) {
    const rect = element.getBoundingClientRect()
    return (
      rect.top <
        columnWrapperRect.value.bottom + columnWrapperRect.value.height &&
      rect.bottom > columnWrapperRect.value.top
    )
  }

  function isElementVisible(
    element: HTMLElement,
    {
      top = columnWrapperRect.value.top,
      bottom = columnWrapperRect.value.bottom,
    } = {}
  ) {
    const rect = element.getBoundingClientRect()
    return (
      Math.round(rect.bottom) <= Math.round(bottom) &&
      Math.round(rect.top) >= Math.round(top)
    )
  }

  function isElementPartiallyVisible(element: HTMLElement) {
    const rect = element.getBoundingClientRect()
    return (
      rect.top < columnWrapperRect.value.bottom &&
      rect.bottom > columnWrapperRect.value.top
    )
  }

  const getContentItems = (item: ScrollColumnItem) => {
    const content = item.contentRef.value
    if (!content) return []
    return content.children[0]?.children ?? []
  }

  // TODO Fix top scroll
  function checkItemsVisibility() {
    visibleItems.value = {}
    let isFirstItem = true
    for (const item of activeItems) {
      const isItemVisible = isElementPartiallyVisible(item.elementRef.value)
      const visibility: VisibleItem = {
        item,
        isFirstItem,
        isVisible: isItemVisible,
      }
      isFirstItem = false

      const subItems = getContentItems(item)
      if (isItemVisible && subItems.length > 0) {
        const visibleIndexes: number[] = []
        const stickyRef = item.stickyRef.value
        const itemTop = stickyRef?.getBoundingClientRect().bottom
        for (let i = 0; i < subItems.length; i++) {
          const subItem = subItems[i]
          if (!(subItem instanceof HTMLElement)) continue
          if (
            isElementVisible(subItem, {
              top: itemTop,
            })
          ) {
            visibleIndexes.push(i)
          }
        }
        visibility.subItemsVisible = visibleIndexes
        visibility.subItemsLength = subItems.length
      }
      visibleItems.value[item.id] = visibility
    }
  }

  function getNextItemOnPage() {
    for (const item of activeItems) {
      const visibility = visibleItems.value[item.id]
      if (!visibility) continue
      const subItemsLength = visibility.subItemsVisible?.length || 0
      if (!visibility.isFirstItem) return { item, isFirstItem: false }
      if (subItemsLength >= 2) {
        const subItems = getContentItems(item)
        const currentSubItemIndex = visibility.subItemsVisible?.[0]
        const nextSubItemIndex = visibility.subItemsVisible?.[1]
        if (
          currentSubItemIndex === undefined ||
          nextSubItemIndex === undefined ||
          !(subItems[currentSubItemIndex] instanceof Element) ||
          !(subItems[nextSubItemIndex] instanceof Element)
        ) {
          continue
        }
        return {
          item,
          currentSubItem: subItems[currentSubItemIndex],
          nextSubItem: subItems[nextSubItemIndex],
          isFirstItem: true,
        }
      }
    }
    return null
  }

  function getNextItemBelowPage() {
    for (const item of activeItems) {
      const visibility = visibleItems.value[item.id]
      if (!visibility) continue
      if (!visibility.isVisible)
        // Item fully below
        return {
          item,
          isFirstItem: visibility.isFirstItem,
        }
      const lastVisibleSubItem = visibility.subItemsVisible?.slice(-1)[0]
      const hasLastVisibleSubItem = lastVisibleSubItem !== undefined
      if (!hasLastVisibleSubItem && !visibility.isFirstItem) {
        // Item header visible but content below
        return {
          item,
          isFirstItem: visibility.isFirstItem,
        }
      }
      if (
        hasLastVisibleSubItem &&
        visibility.subItemsLength !== undefined &&
        lastVisibleSubItem < visibility.subItemsLength - 1
      ) {
        const nextSubItem = getContentItems(item)[lastVisibleSubItem + 1]
        if (!(nextSubItem instanceof Element)) {
          continue
        }
        // Item content not fully visible
        return {
          item,
          nextSubItem,
          isFirstItem: visibility.isFirstItem,
        }
      }
    }
    return null
  }

  return {
    columnWrapper,
    columnWrapperRect,
    columnItems,
    getNextItemOnPage,
    getNextItemBelowPage,
    checkItemsVisibility,
  }
}

export function useScrollColumnItem(category: string) {
  const registerScrollColumnItem = inject(registerScrollColumnItemKey)
  if (!registerScrollColumnItem) {
    throw new Error('registerScrollColumnItem not provided')
  }

  const scrollItemRef = ref<HTMLElement | null>(null)
  const stickyRef = ref<HTMLElement | null>(null)
  const contentRef = ref<HTMLElement | null>(null)
  const isActive = ref(false)

  onMounted(() => {
    if (scrollItemRef.value) {
      registerScrollColumnItem({
        id: category,
        elementRef: ref(scrollItemRef.value),
        stickyRef,
        contentRef,
        isActive,
      })
    }
  })

  return { scrollItemRef, stickyRef, contentRef, isActive }
}
