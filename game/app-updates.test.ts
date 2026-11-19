import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { watchAppVersion, appUpdateUrl, canAutoApplyUpdate } from './app-updates.ts';

const oldVersion = 'aaaaaaaa-1111-4111-8111-111111111111';
const newVersion = 'bbbbbbbb-2222-4222-8222-222222222222';
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function setup(t: TestContext, options: { result?: () => Promise<Response>; hidden?: boolean; online?: boolean } = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1_000_000 });
  const window = Object.assign(new EventTarget(), { navigator: { onLine: options.online ?? true } });
  const document = Object.assign(new EventTarget(), { hidden: options.hidden ?? false });
  const calls: { url: string; init?: RequestInit }[] = [], updates: { version: string | null; initial: boolean }[] = [];
  let latest = oldVersion;
  const stop = watchAppVersion({ version: oldVersion, url: 'https://game.test/online-office/app-version.json', window, document,
    fetcher: async (url, init) => { calls.push({ url: String(url), init }); return options.result ? options.result() : Response.json({ version: latest }); },
    onUpdate: (version, initial) => updates.push({ version, initial }),
  });
  t.after(stop);
  return { window, document, calls, updates, stop, setVersion: (value: string) => { latest = value; }, advance: (ms: number) => t.mock.timers.tick(ms) };
}

test('checks at startup and every five visible minutes with uncached requests', async t => {
  const w = setup(t); await flush();
  assert.equal(w.calls.length, 1); assert.equal(w.updates.length, 0);
  assert.equal(w.calls[0].init?.cache, 'no-store');
  assert.equal(w.calls[0].init?.credentials, 'omit');
  assert.ok(new URL(w.calls[0].url).searchParams.has('check'));
  w.setVersion(newVersion); w.advance(5 * 60_000); await flush();
  assert.deepEqual(w.updates, [{ version: newVersion, initial: false }]);
  w.advance(5 * 60_000); await flush();
  assert.equal(w.updates.length, 1, 'unchanged update does not repeatedly interrupt');
});

test('a newer first response is marked as boot-only', async t => {
  const w = setup(t, { result: async () => Response.json({ version: newVersion }) }); await flush();
  assert.deepEqual(w.updates, [{ version: newVersion, initial: true }]);
});

for (const initiallyUnavailable of ['hidden', 'offline']) {
  test(`starting ${initiallyUnavailable} never auto-applies an update on return`, async t => {
    const w = setup(t, { hidden: initiallyUnavailable === 'hidden', online: initiallyUnavailable !== 'offline' });
    await flush(); assert.equal(w.calls.length, 0);
    w.setVersion(newVersion); w.advance(5 * 60_000);
    w.document.hidden = false; w.window.navigator.onLine = true;
    w.document.dispatchEvent(new Event('visibilitychange'));
    w.window.dispatchEvent(new Event('online')); await flush();
    assert.deepEqual(w.updates, [{ version: newVersion, initial: false }]);
  });
}

test('a startup response loses automatic eligibility after a background round trip', async t => {
  let finish!: (value: Response) => void;
  const w = setup(t, { result: () => new Promise(resolve => { finish = resolve; }) });
  w.document.hidden = true; w.document.dispatchEvent(new Event('visibilitychange'));
  w.document.hidden = false; w.document.dispatchEvent(new Event('visibilitychange'));
  finish(Response.json({ version: newVersion })); await flush();
  assert.deepEqual(w.updates, [{ version: newVersion, initial: false }]);
});

test('rollback to the loaded version clears a previously shown notice', async t => {
  const w = setup(t); await flush();
  w.setVersion(newVersion); w.advance(5 * 60_000); await flush();
  w.setVersion(oldVersion); w.advance(5 * 60_000); await flush();
  assert.deepEqual(w.updates, [{ version: newVersion, initial: false }, { version: null, initial: false }]);
});

test('hidden and offline pages catch up once when active and throttle duplicate events', async t => {
  const w = setup(t); await flush();
  w.document.hidden = true; w.advance(20 * 60_000); await flush();
  assert.equal(w.calls.length, 1);
  w.document.hidden = false; w.window.navigator.onLine = false;
  w.document.dispatchEvent(new Event('visibilitychange')); await flush();
  assert.equal(w.calls.length, 1);
  w.window.navigator.onLine = true;
  w.window.dispatchEvent(new Event('online')); w.window.dispatchEvent(new Event('focus')); await flush();
  assert.equal(w.calls.length, 2);
  w.window.dispatchEvent(new Event('focus')); await flush();
  assert.equal(w.calls.length, 2);
});

test('errors and invalid responses do not announce an update', async t => {
  let count = 0;
  const w = setup(t, { result: async () => {
    count++;
    if (count === 1) throw new Error('Offline');
    if (count === 2) return new Response('Unavailable', { status: 503 });
    if (count === 3) return new Response('<html>not JSON</html>');
    return Response.json({ version: 'https://evil.test/' });
  } });
  await flush();
  for (let i = 0; i < 3; i++) { w.advance(5 * 60_000); await flush(); }
  assert.equal(w.updates.length, 0);
});

test('pending requests do not overlap and disposal aborts and ignores late results', async t => {
  let finish!: (value: Response) => void;
  const w = setup(t, { result: () => new Promise(resolve => { finish = resolve; }) });
  w.advance(10 * 60_000); w.window.dispatchEvent(new Event('focus'));
  assert.equal(w.calls.length, 1);
  w.stop(); assert.equal(w.calls[0].init?.signal?.aborted, true);
  finish(Response.json({ version: newVersion })); await flush();
  assert.equal(w.updates.length, 0);
  w.advance(10 * 60_000); w.window.dispatchEvent(new Event('online'));
  assert.equal(w.calls.length, 1);
});

test('automatic apply is only before interaction on a visible initial boot, once per version', () => {
  const conditions = { initial: true, interacted: false, hidden: false, href: 'https://game.test/online-office/?room=ABC123', version: newVersion };
  assert.equal(canAutoApplyUpdate(conditions), true);
  for (const override of [{ initial: false }, { interacted: true }, { hidden: true }, { href: appUpdateUrl(conditions.href, newVersion) }]) {
    assert.equal(canAutoApplyUpdate({ ...conditions, ...override }), false);
  }
});

test('apply preserves origin, base path, room, mode and hash, replacing only the version marker', () => {
  const href = 'https://choi-seojun.github.io/online-office/?room=ABC123&mode=multi#board';
  const url = new URL(appUpdateUrl(href, newVersion));
  assert.equal(url.origin + url.pathname, 'https://choi-seojun.github.io/online-office/');
  assert.equal(url.searchParams.get('room'), 'ABC123');
  assert.equal(url.searchParams.get('mode'), 'multi'); assert.equal(url.hash, '#board');
  assert.equal(url.searchParams.get('__office_build'), newVersion);
  assert.equal(new URL(appUpdateUrl(url.href, oldVersion)).searchParams.getAll('__office_build').length, 1);
});
