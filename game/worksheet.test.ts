import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkSheet, readWorkSheet, writeWorkSheet, resetWorkSheet, updateWorkSheet, WORKSHEET_KEY } from './worksheet.ts';

test('worksheet edits preserve Korean text and spaces across a browser storage round trip', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const original = createWorkSheet();
  const updated = updateWorkSheet(original, 3, 2, '오늘은 적당히  쉬기');
  assert.equal(updated[3][2], '오늘은 적당히  쉬기');
  assert.equal(original[3][2], '완벽');
  assert.equal(writeWorkSheet(updated, storage), true);
  assert.equal(readWorkSheet(storage)[3][2], '오늘은 적당히  쉬기');
  assert.equal(updateWorkSheet(updated, -1, 0, 'oops'), updated);
  assert.equal(updateWorkSheet(updated, 0, 4, 'oops'), updated);
  assert.equal(resetWorkSheet(storage), true);
  assert.equal(values.has(WORKSHEET_KEY), false);
  assert.equal(readWorkSheet(storage)[3][2], '완벽');
});

test('corrupt or blocked worksheet storage does not crash or grow the sheet beyond its bounds', () => {
  assert.deepEqual(readWorkSheet({ getItem: () => '{broken' }), createWorkSheet());
  const huge = Array.from({ length: 10 }, () => Array.from({ length: 7 }, () => 'x'.repeat(500)));
  const sheet = readWorkSheet({ getItem: () => JSON.stringify({ version: 1, cells: huge }) });
  assert.equal(sheet.length, 5); assert.equal(sheet[0].length, 3); assert.equal(sheet[0][0].length, 80);
  const mixed = readWorkSheet({ getItem: () => JSON.stringify({ version: 1, cells: [[null, '진행 중', 123]] }) });
  assert.equal(mixed[0][0], '이번 주 할 일'); assert.equal(mixed[0][1], '진행 중');
  assert.equal(writeWorkSheet(sheet, { setItem() { throw new Error('quota'); } }), false);
  assert.equal(resetWorkSheet({ removeItem() { throw new Error('blocked'); } }), false);
});

test('unsaved worksheet edits survive remounts while storage is blocked and reset clears the fallback', () => {
  resetWorkSheet({ removeItem() {} });
  const blocked = { getItem(): string | null { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
  const edited = updateWorkSheet(createWorkSheet(), 2, 1, '옥상 다녀와서 계속');
  assert.equal(writeWorkSheet(edited, blocked), false);
  assert.equal(readWorkSheet(blocked)[2][1], '옥상 다녀와서 계속');
  const returned = readWorkSheet(blocked); returned[2][1] = 'caller mutation';
  assert.equal(readWorkSheet(blocked)[2][1], '옥상 다녀와서 계속');
  assert.equal(resetWorkSheet(blocked), false);
  assert.equal(readWorkSheet(blocked)[2][1], '검토 중');
});

test('quota failures preserve newer edits over stale stored cells but accept external storage changes', () => {
  resetWorkSheet({ removeItem() {} });
  let persisted = JSON.stringify({ version: 1, cells: createWorkSheet() });
  const storage = { getItem: () => persisted, setItem() { throw new Error('quota'); } };
  const edited = updateWorkSheet(readWorkSheet(storage), 1, 2, '이 탭의 최신 메모');
  assert.equal(writeWorkSheet(edited, storage), false);
  assert.equal(readWorkSheet(storage)[1][2], '이 탭의 최신 메모');
  persisted = JSON.stringify({ version: 1, cells: updateWorkSheet(createWorkSheet(), 1, 2, '다른 탭에서 저장한 메모') });
  assert.equal(readWorkSheet(storage)[1][2], '다른 탭에서 저장한 메모');
  assert.equal(readWorkSheet({ getItem() { throw new Error('blocked again'); } })[1][2], '다른 탭에서 저장한 메모');
  resetWorkSheet({ removeItem() {} });
});
