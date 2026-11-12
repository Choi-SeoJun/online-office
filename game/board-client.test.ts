import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoardEntry, deleteBoardEntry, listBoard, loadLocalBoard, saveLocalBoard } from './board-client.ts';
import { type BoardEntry } from './board-types.ts';
import { RoomApiError } from './multi-client.ts';

const post: BoardEntry = {
  id: 'cfd88e93-894f-4df5-a294-c292d7e98fe7', kind: 'note', color: 'yellow', text: '회의', strokes: [],
  authorId: 'local', authorName: '김사원', createdAt: 100,
};
const session = { code: 'ABCDEFGH', token: 'a'.repeat(64), playerId: 'private' };

test('solo board validates local storage and handles unavailable storage', () => {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
  };
  assert.equal(saveLocalBoard([post], storage), true);
  assert.deepEqual(loadLocalBoard(storage), [post]);
  assert.equal(saveLocalBoard([post, post], storage), false);
  assert.equal(saveLocalBoard([{ ...post, authorId: post.id }], storage), false);
  assert.deepEqual(loadLocalBoard(storage), [post]);
  assert.deepEqual(loadLocalBoard({ getItem: () => '{' }), []);
  assert.equal(saveLocalBoard([post], { setItem: () => { throw new Error('Full'); } }), false);
});

test('board transport uses a fixed endpoint and sends only session credentials and the operation', async t => {
  const remote = { ...post, authorId: post.id };
  Reflect.set(globalThis, '__OFFICE_ROOM_ENDPOINT__', 'https://office.example/api/rooms');
  t.after(() => Reflect.deleteProperty(globalThis, '__OFFICE_ROOM_ENDPOINT__'));
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ entries: [remote] }));
  assert.deepEqual(await listBoard(session), [remote]);
  assert.deepEqual(await createBoardEntry(session, post), [remote]);
  assert.deepEqual(await deleteBoardEntry(session, post.id), [remote]);
  const calls = fetchMock.mock.calls as unknown as { arguments: [string, RequestInit] }[];
  for (const { arguments: [endpoint, options] } of calls) {
    assert.equal(endpoint, 'https://office.example/api/board');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(String(options.body));
    assert.equal(body.token, session.token);
    assert.equal(body.code, session.code);
    assert.equal('playerId' in body, false);
  }
  const draft = JSON.parse(String(calls[1].arguments[1].body)).draft;
  assert.equal('authorId' in draft, false);
  assert.equal('authorName' in draft, false);
});

test('board transport surfaces server errors, invalid payloads and cancellation', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'BOARD_FULL', error: '가득 찼어요.' }, { status: 409 }));
  await assert.rejects(listBoard(session), error => error instanceof RoomApiError && error.code === 'BOARD_FULL' && error.status === 409);
  mock.mock.mockImplementation(async () => Response.json({ entries: [post] }));
  await assert.rejects(listBoard(session), error => error instanceof RoomApiError && error.code === 'INVALID_RESPONSE');
  await assert.rejects(listBoard(session, AbortSignal.abort()), { name: 'AbortError' });
});
