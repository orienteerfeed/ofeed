import { useEffect, useState } from 'react';
import {
  DEFAULT_VIEW_MODE,
  resolveInitialViewMode,
  VIEW_MODE_KEY,
  type EventListViewMode,
} from './eventListUtils';

export function useEventListViewMode(mapViewEnabled: boolean) {
  const [viewMode, setViewMode] = useState<EventListViewMode>(() =>
    resolveInitialViewMode(mapViewEnabled)
  );

  useEffect(() => {
    if (!mapViewEnabled && viewMode === 'map') {
      setViewMode(DEFAULT_VIEW_MODE);
    }
  }, [mapViewEnabled, viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // ignore storage errors
    }
  }, [viewMode]);

  return [viewMode, setViewMode] as const;
}
