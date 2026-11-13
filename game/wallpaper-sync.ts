type ImageChoice = string | null | undefined;
type SyncStatus = 'saved' | 'syncing' | 'retrying';

/** One queue per room session. A late upload can never overwrite a newer personal choice. */
export function createWallpaperSync(options: {
  save: (image: string | null, signal: AbortSignal) => Promise<unknown>;
  onSaved: () => void;
  onStatus: (status: SyncStatus) => void;
  initialImage?: ImageChoice;
  schedule?: (run: () => void, delay: number) => () => void;
  now?: () => number;
}) {
  const schedule = options.schedule ?? ((run, delay) => { const id = setTimeout(run, delay); return () => clearTimeout(id); });
  const now = options.now ?? Date.now, abort = new AbortController();
  let desired: ImageChoice, shared = options.initialImage, running = false, stopped = false, after = 0;
  let cancelTimer: (() => void) | undefined;
  const flush = async () => {
    cancelTimer?.(); cancelTimer = undefined;
    if (stopped || running || desired === undefined) return;
    if (desired === shared) { options.onStatus('saved'); return; }
    if (now() < after) { cancelTimer = schedule(() => void flush(), after - now()); return; }
    running = true; const image = desired; options.onStatus('syncing');
    try {
      await options.save(image, abort.signal);
      if (stopped) return;
      shared = image; after = now() + 2200; options.onSaved();
      options.onStatus(desired === shared ? 'saved' : 'syncing');
    } catch {
      // A timeout can happen after the server committed the image. Reassert the
      // latest choice even when it equals the previously acknowledged value.
      if (!stopped) { shared = undefined; after = now() + 5000; options.onStatus('retrying'); }
    } finally {
      running = false;
      if (!stopped && desired !== undefined && desired !== shared) cancelTimer = schedule(() => void flush(), Math.max(0, after - now()));
    }
  };
  return {
    set(image: ImageChoice) { desired = image; void flush(); },
    retry() { void flush(); },
    dispose() { stopped = true; abort.abort(); cancelTimer?.(); },
  };
}
