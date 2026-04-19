import type { Ref, InjectionKey } from 'vue'
import type { useOfeed } from '@/composables/providers/useOfeed'
import type { useLiveResultat } from '@/composables/providers/useLiveResultat'
import type { useMockData } from '@/composables/providers/useMockData'

export type AddScrollTableElementFn = (component: Ref<HTMLElement>) => void
export const addScrollTableElementKey =
  Symbol() as InjectionKey<AddScrollTableElementFn>

export type DataProviderInstance =
  | ReturnType<typeof useOfeed>
  | (ReturnType<typeof useLiveResultat> & { getRelayTeamsLoader?: never })
  | (ReturnType<typeof useMockData> & { getRelayTeamsLoader?: never })
export type DataProviderSet = () => DataProviderInstance
export const useDataProviderKey = Symbol() as InjectionKey<DataProviderSet>

export const isTableActiveKey = Symbol() as InjectionKey<Ref<boolean>>
