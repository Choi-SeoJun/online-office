type DeviceNavigator = { userAgent: string; maxTouchPoints?: number; standalone?: boolean };
export type InstallPlatform = 'ios' | 'android' | 'desktop';
export type InstallResult = 'accepted' | 'dismissed' | 'unavailable' | 'error';
export type InstallSnapshot = { platform: InstallPlatform; installed: boolean; canPrompt: boolean; pending: boolean; ready: boolean };
type InstallOffer = Event & { prompt: () => Promise<unknown>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export function installPlatform(device: DeviceNavigator): InstallPlatform {
  if (/iPad|iPhone|iPod/i.test(device.userAgent) || (/Macintosh/i.test(device.userAgent) && (device.maxTouchPoints ?? 0) > 1)) return 'ios';
  return /Android/i.test(device.userAgent) ? 'android' : 'desktop';
}

/** A single owner survives solo/multi navigation. Never persist an "installed"
 * flag: an uninstall cannot be observed reliably from a later browser visit. */
export function createAppInstallController({ events, display, navigator }: {
  events: EventTarget; display: EventTarget & { matches: boolean }; navigator: DeviceNavigator;
}) {
  let offer: InstallOffer | null = null, installedThisSession = false, disposed = false;
  let snapshot: InstallSnapshot = { platform: installPlatform(navigator), installed: display.matches || navigator.standalone === true, canPrompt: false, pending: false, ready: true };
  const listeners = new Set<() => void>();
  const publish = (next: Partial<InstallSnapshot>) => {
    if (disposed) return;
    snapshot = { ...snapshot, ...next };
    listeners.forEach(listener => listener());
  };
  const beforeInstall = (event: Event) => {
    if (typeof (event as InstallOffer).prompt !== 'function' || snapshot.installed) return;
    event.preventDefault();
    offer = event as InstallOffer;
    publish({ canPrompt: true });
  };
  const installed = () => { installedThisSession = true; offer = null; publish({ installed: true, canPrompt: false, pending: false }); };
  const displayChanged = () => {
    const isInstalled = installedThisSession || display.matches || navigator.standalone === true;
    if (isInstalled) offer = null;
    publish({ installed: isInstalled, canPrompt: !!offer });
  };
  events.addEventListener('beforeinstallprompt', beforeInstall);
  events.addEventListener('appinstalled', installed);
  display.addEventListener('change', displayChanged);

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async install(): Promise<InstallResult> {
      if (disposed || !offer || snapshot.installed || snapshot.pending) return 'unavailable';
      const current = offer;
      offer = null;
      publish({ canPrompt: false, pending: true });
      try {
        // Do not await anything before prompt(): it requires the click's activation.
        await current.prompt();
        return (await current.userChoice).outcome;
      } catch {
        return 'error';
      } finally {
        publish({ pending: false });
      }
    },
    dispose() {
      disposed = true; offer = null; listeners.clear();
      events.removeEventListener('beforeinstallprompt', beforeInstall);
      events.removeEventListener('appinstalled', installed);
      display.removeEventListener('change', displayChanged);
    },
  };
}
