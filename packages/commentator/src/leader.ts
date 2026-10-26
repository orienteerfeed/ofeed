/** Elect one announcer per scope without depending on tab visibility.
 * Web Locks queue followers and release ownership when a tab closes/crashes.
 */
export function coordinateWinnerAnnouncements(
  eventId: string,
  setActive: (active: boolean) => void
): () => void {
  let stop: (() => void) | undefined;

  const start = () => {
    if (stop || !eventId) return;

    if (navigator.locks) {
      const controller = new AbortController();
      let release: (() => void) | undefined;
      stop = () => {
        controller.abort();
        release?.();
        setActive(false);
        stop = undefined;
      };
      void navigator.locks
        .request(`ofeed:winner-announcer:${eventId}`, { signal: controller.signal }, () => {
          if (controller.signal.aborted) return;
          setActive(true);
          return new Promise<void>(resolve => {
            release = resolve;
          });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) console.warn('Winner announcer election failed:', error);
        });
      return;
    }

    // Older browsers: a renewable lease lets a follower recover a lost owner.
    const key = `ofeed:winner-announcer:${eventId}`;
    const owner = `${Date.now()}-${Math.random()}`;
    const renew = () => {
      try {
        const stored: { owner: string; expires: number } | null = JSON.parse(
          localStorage.getItem(key) ?? 'null'
        );
        const active = !stored || stored.owner === owner || stored.expires <= Date.now();
        if (active)
          localStorage.setItem(key, JSON.stringify({ owner, expires: Date.now() + 30000 }));
        setActive(active);
      } catch {
        setActive(false);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) renew();
    };
    renew();
    const interval = window.setInterval(renew, 5000);
    window.addEventListener('storage', onStorage);
    stop = () => {
      window.clearInterval(interval);
      window.removeEventListener('storage', onStorage);
      try {
        if (JSON.parse(localStorage.getItem(key) ?? 'null')?.owner === owner)
          localStorage.removeItem(key);
      } catch {
        // Storage may become unavailable after acquiring the lease.
      } finally {
        setActive(false);
        stop = undefined;
      }
    };
  };

  const pause = () => stop?.();
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', start);
  start();
  return () => {
    window.removeEventListener('pagehide', pause);
    window.removeEventListener('pageshow', start);
    pause();
  };
}
