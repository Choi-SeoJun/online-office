export const APP_VERSION_INTERVAL = 5 * 60_000;
const versionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validVersion = (value: unknown): value is string => typeof value === 'string' && versionPattern.test(value);

export function appUpdateUrl(href: string, version: string) {
  if (!validVersion(version)) throw new Error('Invalid app version');
  const url = new URL(href);
  url.searchParams.set('__office_build', version);
  return url.href;
}

export function canAutoApplyUpdate({ initial, interacted, hidden, href, version }: {
  initial: boolean; interacted: boolean; hidden: boolean; href: string; version: string;
}) {
  return initial && !interacted && !hidden && validVersion(version) && new URL(href).searchParams.get('__office_build') !== version;
}

export function watchAppVersion({ version, url, window, document, onUpdate, fetcher = fetch }: {
  version: string; url: string;
  window: EventTarget & { navigator: { onLine: boolean } };
  document: EventTarget & { hidden: boolean };
  onUpdate(version: string | null, initial: boolean): void;
  fetcher?: typeof fetch;
}) {
  let stopped = false, first = true, lastAttempt = -Infinity, announced: string | null = null;
  let active: AbortController | null = null, timeout: ReturnType<typeof setTimeout> | null = null;
  async function check(foreground = false) {
    if (stopped || active || document.hidden || !window.navigator.onLine) return;
    const now = Date.now();
    if (now >= lastAttempt && now - lastAttempt < (foreground ? 60_000 : APP_VERSION_INTERVAL)) return;
    const initial = first; first = false; lastAttempt = now;
    const request = new AbortController(); active = request;
    timeout = setTimeout(() => request.abort(), 8000);
    try {
      const target = new URL(url); target.searchParams.set('check', String(now));
      const response = await fetcher(target.href, { signal: request.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (stopped || request.signal.aborted || !data || typeof data !== 'object' || !('version' in data) || !validVersion(data.version)) return;
      const next = data.version === version ? null : data.version;
      if (next !== announced) { announced = next; onUpdate(next, initial); }
    } catch { /* Updates are optional while offline; never block the game. */ }
    finally {
      if (timeout !== null) clearTimeout(timeout);
      timeout = null;
      if (active === request) active = null;
    }
  }
  const tick = () => { void check(); };
  const foreground = () => { void check(true); };
  window.addEventListener('focus', foreground);
  window.addEventListener('online', foreground);
  document.addEventListener('visibilitychange', foreground);
  const timer = setInterval(tick, 30_000);
  tick();
  return () => {
    stopped = true; active?.abort();
    if (timeout !== null) clearTimeout(timeout);
    clearInterval(timer);
    window.removeEventListener('focus', foreground);
    window.removeEventListener('online', foreground);
    document.removeEventListener('visibilitychange', foreground);
  };
}
