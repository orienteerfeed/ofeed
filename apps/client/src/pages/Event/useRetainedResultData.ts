import { useState } from 'react';

/** An undefined network result during reconnect/error is not an empty snapshot.
 * Reset synchronously on scope changes so another class/club never leaks in. */
export function useRetainedResultData<T>(
  scope: string | number | undefined,
  data: T | undefined
): T | undefined {
  const [saved, setSaved] = useState({ scope, data });
  if (saved.scope !== scope || (data !== undefined && saved.data !== data)) {
    setSaved({ scope, data });
    return data;
  }
  return saved.data;
}
