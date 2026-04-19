import { inject } from 'vue'
import { useDataProviderKey } from '@/types/providers'

export type DataProviders = 'ofeed' | 'liveResultat' | 'test'

export function useDataProvider() {
  const dataProviderFactory = inject(useDataProviderKey)
  if (!dataProviderFactory) throw new Error('No data provider found')
  return dataProviderFactory()
}
