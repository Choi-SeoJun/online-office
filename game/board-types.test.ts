import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoardDraft } from './board-types.ts';

const note = { id: 'cfd88e93-894f-4df5-a294-c292d7e98fe7', kind: 'note', color: 'yellow', text: '기존 메모', strokes: [] };

test('board parsing retains legacy notes and optional bounded positions', () => {
  assert.deepEqual(parseBoardDraft(note), note);
  const placement = { x: .7, y: .2, width: .3, height: .4 };
  assert.deepEqual(parseBoardDraft({ ...note, placement }), { ...note, placement });
  for (const placement of [null, { x: -.1, y: 0, width: .2, height: .2 }, { x: .9, y: 0, width: .2, height: .2 }, { x: 0, y: 0, width: 0, height: 1 }, { x: 0, y: NaN, width: 1, height: 1 }]) {
    assert.equal(parseBoardDraft({ ...note, placement }), null);
  }
});

test('placement parsing round-trips the canvas coordinate system and rejects unknown versions', () => {
  for (const canvasWidth of [1200, 2160]) {
    const placement = { x: .1, y: .2, width: .2, height: .3, canvasWidth };
    assert.deepEqual(parseBoardDraft({ ...note, placement }), { ...note, placement });
  }
  for (const canvasWidth of [0, 720, 1201, '2160', null]) {
    assert.equal(parseBoardDraft({ ...note, placement: { x: .1, y: .2, width: .2, height: .3, canvasWidth } }), null);
  }
});

test('board drawing parses legacy pens and validates fill seeds and pen widths', () => {
  const legacy = { color: 'ink', points: [{ x: .1, y: .1 }, { x: .9, y: .9 }] };
  const fill = { tool: 'fill', color: 'blue', points: [{ x: .5, y: .5 }] };
  const pen = { ...legacy, tool: 'pen', width: 8 };
  const doodle = { ...note, kind: 'doodle', text: '', strokes: [legacy, pen, fill], placement: { x: 0, y: 0, width: 1, height: 1 } };
  assert.deepEqual(parseBoardDraft(doodle), doodle);
  for (const stroke of [{ ...fill, points: legacy.points }, { ...pen, width: 0 }, { ...pen, width: 33 }, { ...pen, width: NaN }, { ...pen, tool: 'erase' }]) {
    assert.equal(parseBoardDraft({ ...doodle, strokes: [stroke] }), null);
  }
});
