import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as render from './board-render.ts';
import type { BoardEntry } from './board-types.ts';

const note: BoardEntry = { id: 'cfd88e93-894f-4df5-a294-c292d7e98fe7', kind: 'note', color: 'yellow', text: '메모', strokes: [], authorId: 'local', authorName: '동료', createdAt: 100 };

test('legacy placement stays stable as other posts arrive and explicit positions take priority', () => {
  assert.equal(typeof render.getBoardPlacement, 'function');
  const placement = render.getBoardPlacement(note);
  const edited = { ...note, text: '수정된 메모' };
  assert.deepEqual(render.getBoardPlacement(edited), placement);
  assert.ok(placement.x >= 0 && placement.y >= 0 && placement.width > 0 && placement.height > 0);
  assert.ok(placement.x + placement.width <= 1 && placement.y + placement.height <= 1);
  const moved = { x: .1, y: .2, width: .25, height: .3, canvasWidth: 2160 as const };
  assert.deepEqual(render.getBoardPlacement({ ...note, placement: moved }), moved);
});

test('widening preserves legacy card dimensions and positions inside the right-hand original board', () => {
  const original = { x: .1, y: .2, width: .25, height: .3 };
  const converted = render.getBoardPlacement({ ...note, placement: original });
  assert.equal(converted.canvasWidth, 2160);
  assert.equal(converted.x * render.BOARD_WIDTH, 960 + original.x * 1200);
  assert.equal(converted.width * render.BOARD_WIDTH, original.width * 1200);
  assert.equal(converted.y, original.y); assert.equal(converted.height, original.height);
  assert.deepEqual(render.getBoardPlacement({ ...note, placement: converted }), converted, 'moving a converted note cannot shrink it again');
  const defaultLegacy = render.getBoardPlacement(note);
  assert.ok(defaultLegacy.x >= 960 / render.BOARD_WIDTH);
  assert.ok(Math.abs(defaultLegacy.width * render.BOARD_WIDTH - 258) < 1e-8);
  const fresh = render.newBoardPlacement(note);
  assert.equal(fresh.canvasWidth, 2160);
  assert.ok(Math.abs(fresh.width * render.BOARD_WIDTH - 258) < 1e-8);
  assert.ok(fresh.x + fresh.width <= 1 && fresh.y + fresh.height <= 1);
});

test('legacy freehand shapes and fills stay inside the original board while new ink can cover the extension', () => {
  const paths: number[][] = [], reads: number[][] = [], widths: number[] = [];
  const context = {
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    save() {}, restore() {}, setTransform() {}, clearRect() {}, beginPath() {}, rect() {}, clip() {}, arc() {}, fill() {}, fillText() {}, fillRect() {},
    moveTo(x: number, y: number) { paths.push([x, y]); }, lineTo(x: number, y: number) { paths.push([x, y]); },
    stroke(this: { lineWidth: number }) { widths.push(this.lineWidth); },
    getImageData(x: number, y: number, w: number, h: number) { reads.push([x, y, w, h]); return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {},
  } as unknown as CanvasRenderingContext2D;
  const oldDrawing: BoardEntry = { ...note, kind: 'doodle', placement: { x: 0, y: 0, width: 1, height: 1 }, strokes: [
    { color: 'ink', width: 8, points: [{ x: .1, y: .2 }, { x: .2, y: .4 }] },
    { color: 'blue', tool: 'fill', points: [{ x: .5, y: .5 }] },
  ] };
  assert.equal(render.isBoardDrawing(oldDrawing), true);
  render.drawBoard(context, [oldDrawing], 216, 72);
  assert.deepEqual(paths, [[108, 14.4], [120, 28.8]]);
  assert.deepEqual(reads, [[96, 0, 120, 72]]);
  assert.deepEqual(widths, [.8]);
  paths.length = 0; reads.length = 0;
  render.drawBoard(context, [{ ...oldDrawing, placement: { ...oldDrawing.placement!, canvasWidth: 2160 } }], 216, 72);
  assert.deepEqual(reads, [[0, 0, 216, 72]]);
  assert.deepEqual(paths, [[21.6, 14.4], [43.2, 28.8]]);
});

test('board fills are replayed beneath notes so moving notes cannot change their region', () => {
  const operations: string[] = [];
  const context = {
    fillStyle: '', strokeStyle: '',
    save() {}, restore() {}, setTransform() {}, clearRect() {}, beginPath() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, fillText() {},
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillRect(this: { fillStyle: string }) { operations.push(this.fillStyle); },
    stroke() { operations.push('pen'); },
    getImageData() { operations.push('read'); return { data: new Uint8ClampedArray(40 * 24 * 4).fill(255) }; },
    putImageData() { operations.push('fill'); },
  } as unknown as CanvasRenderingContext2D;
  const drawing: BoardEntry = { ...note, id: '00000000-0000-4000-8000-000000000001', kind: 'doodle', createdAt: 200,
    placement: { x: 0, y: 0, width: 1, height: 1 }, strokes: [
      { color: 'ink', points: [{ x: .1, y: .1 }, { x: .8, y: .8 }] },
      { color: 'blue', tool: 'fill', points: [{ x: .5, y: .5 }] },
    ] };
  render.drawBoard(context, [note, drawing], 40, 24);
  assert.deepEqual(operations, [render.BOARD_SURFACE, 'pen', 'read', 'fill', render.BOARD_PAPER.yellow]);
  operations.length = 0;
  render.drawBoard(context, [drawing, { ...note, placement: { x: .5, y: .5, width: .2, height: .2 } }], 40, 24);
  assert.deepEqual(operations, [render.BOARD_SURFACE, 'pen', 'read', 'fill', render.BOARD_PAPER.yellow]);
});

test('bucket fill changes only connected pixels inside a closed pen boundary', () => {
  assert.equal(typeof render.floodFillPixels, 'function');
  const pixels = new Uint8ClampedArray(7 * 7 * 4).fill(255);
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) {
    if (x !== 1 && x !== 5 && y !== 1 && y !== 5) continue;
    const offset = (y * 7 + x) * 4;
    pixels.set([20, 20, 20, 255], offset);
  }
  assert.equal(render.floodFillPixels(pixels, 7, 7, 3, 3, [70, 130, 170, 255]), 9);
  assert.deepEqual(Array.from(pixels.slice((3 * 7 + 3) * 4, (3 * 7 + 3) * 4 + 4)), [70, 130, 170, 255]);
  assert.deepEqual(Array.from(pixels.slice(0, 4)), [255, 255, 255, 255]);
  assert.deepEqual(Array.from(pixels.slice((1 * 7 + 3) * 4, (1 * 7 + 3) * 4 + 4)), [20, 20, 20, 255]);
  assert.equal(render.floodFillPixels(pixels, 7, 7, 3, 3, [70, 130, 170, 255]), 0);
  assert.equal(render.floodFillPixels(pixels, 7, 7, -1, 3, [0, 0, 0, 255]), 0);
});

test('drawing cache reuses filled pixels across note moves and a changing final pen stroke', () => {
  let reads = 0;
  const context = {
    canvas: {}, fillStyle: '', strokeStyle: '',
    save() {}, restore() {}, setTransform() {}, clearRect() {}, beginPath() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, fillText() {}, stroke() {}, fillRect() {},
    measureText: (text: string) => ({ width: text.length * 10 }),
    getImageData(_x: number, _y: number, width: number, height: number) { reads++; return { data: new Uint8ClampedArray(width * height * 4).fill(255) }; },
    putImageData() {},
  } as unknown as CanvasRenderingContext2D;
  const drawing: BoardEntry = { ...note, kind: 'doodle', placement: { x: 0, y: 0, width: 1, height: 1 }, strokes: [{ tool: 'fill', color: 'blue', points: [{ x: .2, y: .2 }] }] };
  render.drawBoard(context, [drawing, note], 40, 24);
  const afterFill = reads;
  render.drawBoard(context, [drawing, { ...note, placement: { x: .5, y: .5, width: .2, height: .2 } }], 40, 24);
  assert.equal(reads, afterFill, 'moving a card must not rerun pixel reads or flood fill');
  const pen: BoardEntry = { ...drawing, strokes: [...drawing.strokes, { color: 'ink', points: [{ x: .1, y: .1 }, { x: .3, y: .3 }] }] };
  render.drawBoard(context, [pen], 40, 24);
  assert.equal(reads, afterFill + 1, 'the cached filled layer becomes the prefix of the new pen');
  render.drawBoard(context, [{ ...pen, strokes: [pen.strokes[0], { ...pen.strokes[1], points: [...pen.strokes[1].points, { x: .4, y: .4 }] }] }], 40, 24);
  assert.equal(reads, afterFill + 2, 'extending the pen does not rerun its preceding fill');
  render.drawBoard(context, [drawing], 80, 48);
  assert.ok(reads > afterFill + 3, 'a size change reconstructs the drawing pixels');
  let previousReads = reads;
  const pink = { ...drawing, strokes: [{ ...drawing.strokes[0], color: 'pink' as const }] };
  render.drawBoard(context, [pink], 80, 48);
  assert.ok(reads > previousReads, 'changing a fill color invalidates the image');
  render.drawBoard(context, [note], 80, 48);
  previousReads = reads;
  render.drawBoard(context, [drawing], 80, 48);
  assert.ok(reads > previousReads, 'deleting the drawing clears its cache');
  const later = { ...pink, id: '00000000-0000-4000-8000-000000000002', createdAt: 200 };
  render.drawBoard(context, [drawing, later], 80, 48);
  previousReads = reads;
  render.drawBoard(context, [{ ...drawing, createdAt: 300 }, later], 80, 48);
  assert.ok(reads > previousReads, 'changing drawing order invalidates the composed image');
  render.drawBoard(context, [drawing], 80, 48);
  previousReads = reads;
  render.drawBoard(context, [{ ...drawing, placement: { ...drawing.placement!, canvasWidth: 2160 } }], 80, 48);
  assert.ok(reads > previousReads, 'the same strokes on a new-width canvas must not reuse a legacy-width bitmap');
});
