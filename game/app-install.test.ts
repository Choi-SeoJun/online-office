import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppInstallController, installPlatform } from './app-install.ts';

function environment(standalone = false) {
  const events = new EventTarget();
  const display = Object.assign(new EventTarget(), { matches: standalone });
  const navigator = { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130', maxTouchPoints: 5, standalone: false };
  const controller = createAppInstallController({ events, display, navigator });
  return { events, display, navigator, controller };
}

function offer(events: EventTarget, outcome: 'accepted' | 'dismissed' = 'accepted', failure = false) {
  let calls = 0;
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: () => { calls++; return failure ? Promise.reject(new Error('Unavailable')) : Promise.resolve(); },
    userChoice: Promise.resolve({ outcome }),
  });
  events.dispatchEvent(event);
  return { event, calls: () => calls };
}

test('recognizes iPhone, desktop-UA iPad, Android and desktop separately', () => {
  assert.equal(installPlatform({ userAgent: 'iPhone CriOS/120', maxTouchPoints: 5 }), 'ios');
  assert.equal(installPlatform({ userAgent: 'Macintosh Safari/605', maxTouchPoints: 5 }), 'ios');
  assert.equal(installPlatform({ userAgent: 'Macintosh Safari/605', maxTouchPoints: 0 }), 'desktop');
  assert.equal(installPlatform({ userAgent: 'Linux Android 14', maxTouchPoints: 5 }), 'android');
});

test('captures native offer, invokes prompt synchronously, consumes it only once', async () => {
  const { events, controller } = environment();
  const offered = offer(events);
  assert.equal(offered.event.defaultPrevented, true);
  assert.equal(controller.getSnapshot().canPrompt, true);
  const request = controller.install();
  assert.equal(offered.calls(), 1); // Preserve the browser click's user activation.
  assert.equal(controller.getSnapshot().pending, true);
  assert.equal(await controller.install(), 'unavailable');
  assert.equal(await request, 'accepted');
  assert.equal(controller.getSnapshot().canPrompt, false);
  assert.equal(offered.calls(), 1);
  events.dispatchEvent(new Event('appinstalled'));
  assert.equal(controller.getSnapshot().installed, true);
  controller.dispose();
});

test('cancellation is not installation and a later native event can be retried', async () => {
  const { events, controller } = environment();
  offer(events, 'dismissed');
  assert.equal(await controller.install(), 'dismissed');
  assert.equal(controller.getSnapshot().installed, false);
  assert.equal(await controller.install(), 'unavailable');
  offer(events);
  assert.equal(await controller.install(), 'accepted');
  controller.dispose();
});

test('missing or failed native prompts return a usable fallback state', async () => {
  const { events, controller } = environment();
  assert.equal(await controller.install(), 'unavailable');
  offer(events, 'accepted', true);
  assert.equal(await controller.install(), 'error');
  assert.equal(controller.getSnapshot().pending, false);
  assert.equal(controller.getSnapshot().installed, false);
  controller.dispose();
});

test('installed display and iOS navigator.standalone suppress installation', async () => {
  const { events, display, controller } = environment(true);
  offer(events);
  assert.equal(controller.getSnapshot().installed, true);
  assert.equal(await controller.install(), 'unavailable');
  display.matches = false;
  display.dispatchEvent(new Event('change'));
  assert.equal(controller.getSnapshot().installed, false);
  display.matches = true;
  display.dispatchEvent(new Event('change'));
  assert.equal(controller.getSnapshot().installed, true);
  controller.dispose();
  const ios = createAppInstallController({ events: new EventTarget(), display, navigator: { userAgent: 'iPhone', standalone: true } });
  assert.equal(ios.getSnapshot().installed, true);
  ios.dispose();
});

test('subscribers follow changes; disposed controller drops listeners', () => {
  const { events, controller } = environment();
  let changed = 0;
  const unsubscribe = controller.subscribe(() => changed++);
  offer(events);
  assert.equal(changed, 1);
  unsubscribe();
  events.dispatchEvent(new Event('appinstalled'));
  assert.equal(changed, 1);
  controller.dispose();
  const snapshot = controller.getSnapshot();
  offer(events);
  assert.equal(controller.getSnapshot(), snapshot);
});
