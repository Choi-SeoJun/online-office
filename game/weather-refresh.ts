export const WEATHER_REFRESH_INTERVAL = 5 * 60_000;

type WeatherAttempt = { lastAttempt: number; failures: number; inFlight: boolean };
type WeatherWatcher = {
  window: EventTarget & { navigator: { onLine: boolean } };
  document: EventTarget & { hidden: boolean };
  getAttempt(): WeatherAttempt;
  onTick(now: number): void;
  onRefresh(): void;
};

export function watchLocalWeather({ window, document, getAttempt, onTick, onRefresh }: WeatherWatcher): () => void {
  let stopped = false;
  function check(reconnected = false) {
    if (stopped) return;
    const now = Date.now();
    onTick(now);
    const { lastAttempt, failures, inFlight } = getAttempt();
    if (document.hidden || !window.navigator.onLine || inFlight) return;
    // Transient failures recover sooner; persistent outages don't hammer the API.
    const delay = failures > 0 ? Math.min(WEATHER_REFRESH_INTERVAL, 60_000 * 2 ** Math.min(3, failures - 1)) : WEATHER_REFRESH_INTERVAL;
    if (reconnected || now < lastAttempt || now - lastAttempt >= delay) onRefresh();
  }
  const tick = () => check();
  const online = () => check(true);
  const timer = setInterval(tick, 30_000);
  window.addEventListener('online', online);
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', tick);
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('online', online);
    window.removeEventListener('focus', tick);
    document.removeEventListener('visibilitychange', tick);
  };
}
