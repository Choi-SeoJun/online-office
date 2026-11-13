import type { BoardColor, BoardEntry, BoardPlacement, BoardStroke } from './board-types.ts';

// The editor and wall texture share the wide board's 3:1 drawing surface.
export const BOARD_WIDTH = 2160;
export const BOARD_HEIGHT = 720;
const ORIGINAL_BOARD_WIDTH = 1200;
export const BOARD_INK: Record<BoardColor, string> = { yellow: '#b78918', pink: '#c66681', blue: '#4784aa', green: '#54866b', purple: '#8d6ba6', ink: '#354b45' };
export const BOARD_PAPER: Record<BoardColor, string> = { yellow: '#f6e8a6', pink: '#f3d8d7', blue: '#d4e6ea', green: '#dce7c9', purple: '#e5dcef', ink: '#f2efdf' };
export const BOARD_SURFACE = '#d6bc92';

function placementHash(id: string): number {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

/** The extension is on the left; old ink and cards retain their pixel shapes. */
export function getBoardPlacement(entry: Pick<BoardEntry, 'id' | 'kind' | 'placement'>): BoardPlacement {
  const hash = placementHash(entry.id);
  const placement = entry.placement ?? { x: .035 + (hash % 4) * .235 + ((hash >>> 8) % 15) / 1500,
    y: .045 + ((hash >>> 4) % 3) * .30 + ((hash >>> 16) % 15) / 1500,
    width: .215, height: .265 };
  if (placement.canvasWidth === BOARD_WIDTH) return placement;
  const ratio = ORIGINAL_BOARD_WIDTH / BOARD_WIDTH;
  return { ...placement, x: (BOARD_WIDTH - ORIGINAL_BOARD_WIDTH + placement.x * ORIGINAL_BOARD_WIDTH) / BOARD_WIDTH,
    width: placement.width * ratio, canvasWidth: BOARD_WIDTH };
}

/** New cards use the whole board, at the same readable size as existing cards. */
export function newBoardPlacement(entry: Pick<BoardEntry, 'id' | 'kind'>): BoardPlacement {
  const hash = placementHash(entry.id);
  return { x: .035 + (hash % 6) * .16 + ((hash >>> 8) % 15) / 1500,
    y: .045 + ((hash >>> 4) % 3) * .30 + ((hash >>> 16) % 15) / 1500,
    width: .215 * ORIGINAL_BOARD_WIDTH / BOARD_WIDTH, height: .265, canvasWidth: BOARD_WIDTH };
}

export function isBoardDrawing(entry: Pick<BoardEntry, 'kind' | 'placement'>): boolean {
  const p = entry.placement;
  return entry.kind === 'doodle' && !!p && p.x === 0 && p.y === 0 && p.width === 1 && p.height === 1;
}

export function getBoardPaintOrder(entries: BoardEntry[]): BoardEntry[] {
  return [...entries].sort((a, b) => Number(isBoardDrawing(b)) - Number(isBoardDrawing(a)) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** Four-connected pixel fill. The visited buffer bounds work to one board-sized pass. */
export function floodFillPixels(pixels: Uint8ClampedArray, width: number, height: number, seedX: number, seedY: number,
  color: readonly [number, number, number, number], tolerance = 24): number {
  const x = Math.floor(seedX), y = Math.floor(seedY);
  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x >= width || y >= height || pixels.length !== width * height * 4) return 0;
  const start = y * width + x, offset = start * 4;
  const target = [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
  if (target.every((channel, index) => channel === color[index])) return 0;
  const visited = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let head = 0, tail = 1, changed = 0;
  queue[0] = start; visited[start] = 1;
  while (head < tail) {
    const index = queue[head++], at = index * 4;
    if (Math.abs(pixels[at] - target[0]) > tolerance || Math.abs(pixels[at + 1] - target[1]) > tolerance ||
        Math.abs(pixels[at + 2] - target[2]) > tolerance || Math.abs(pixels[at + 3] - target[3]) > tolerance) continue;
    pixels[at] = color[0]; pixels[at + 1] = color[1]; pixels[at + 2] = color[2]; pixels[at + 3] = color[3]; changed++;
    const column = index % width;
    if (column > 0 && !visited[index - 1]) { visited[index - 1] = 1; queue[tail++] = index - 1; }
    if (column < width - 1 && !visited[index + 1]) { visited[index + 1] = 1; queue[tail++] = index + 1; }
    if (index >= width && !visited[index - width]) { visited[index - width] = 1; queue[tail++] = index - width; }
    if (index < width * (height - 1) && !visited[index + width]) { visited[index + width] = 1; queue[tail++] = index + width; }
  }
  return changed;
}

function paintStrokes(ctx: CanvasRenderingContext2D, strokes: BoardStroke[], area: BoardPlacement, scale: number) {
  ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.width, area.height); ctx.clip();
  for (const stroke of strokes) {
    const first = stroke.points[0];
    if (!first) continue;
    if (stroke.tool === 'fill') {
      const x = Math.max(0, Math.floor(area.x)), y = Math.max(0, Math.floor(area.y));
      const width = Math.max(1, Math.floor(area.width)), height = Math.max(1, Math.floor(area.height));
      const data = ctx.getImageData(x, y, width, height), hex = BOARD_INK[stroke.color];
      floodFillPixels(data.data, width, height, Math.min(width - 1, first.x * width), Math.min(height - 1, first.y * height),
        [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255]);
      ctx.putImageData(data, x, y);
      continue;
    }
    ctx.strokeStyle = ctx.fillStyle = BOARD_INK[stroke.color];
    ctx.lineWidth = (stroke.width ?? 3) * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(area.x + first.x * area.width, area.y + first.y * area.height);
    for (const point of stroke.points.slice(1)) ctx.lineTo(area.x + point.x * area.width, area.y + point.y * area.height);
    if (stroke.points.length === 1) { ctx.arc(area.x + first.x * area.width, area.y + first.y * area.height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    else ctx.stroke();
  }
  ctx.restore();
}

type DrawingCache = { width: number; height: number; key: string; image: ImageData; prefixKey: string; prefix: ImageData };
const drawingCaches = new WeakMap<CanvasRenderingContext2D, DrawingCache>();

/** At most two bitmaps per live context: the drawing and the prefix before its active last stroke. */
function paintBoardDrawing(ctx: CanvasRenderingContext2D, entries: BoardEntry[], width: number, height: number) {
  const scale = width / BOARD_WIDTH;
  const strokes = entries.flatMap(entry => {
    const placement = getBoardPlacement(entry);
    const area = { x: placement.x * width, y: placement.y * height, width: placement.width * width, height: placement.height * height };
    return entry.strokes.map(stroke => ({ stroke, area }));
  });
  const paint = (items: typeof strokes) => { for (const { stroke, area } of items) paintStrokes(ctx, [stroke], area, scale); };
  if (!ctx.canvas) { paint(strokes); return; }
  if (!strokes.length) { drawingCaches.delete(ctx); return; }
  const key = JSON.stringify(strokes), cached = drawingCaches.get(ctx);
  const previous = cached?.width === width && cached.height === height ? cached : undefined;
  if (previous?.key === key) { ctx.putImageData(previous.image, 0, 0); return; }
  const prefixStrokes = strokes.slice(0, -1), prefixKey = JSON.stringify(prefixStrokes);
  let prefix: ImageData;
  if (previous?.key === prefixKey) prefix = previous.image;
  else if (previous?.prefixKey === prefixKey) prefix = previous.prefix;
  else {
    paint(prefixStrokes);
    prefix = ctx.getImageData(0, 0, width, height);
  }
  ctx.putImageData(prefix, 0, 0);
  paint(strokes.slice(-1));
  drawingCaches.set(ctx, { width, height, key, image: ctx.getImageData(0, 0, width, height), prefixKey, prefix });
}

function wrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, lines: number) {
  let line = '', row = 0;
  for (const character of Array.from(text)) {
    if (character === '\n' || ctx.measureText(line + character).width > width) {
      if (row >= lines - 1) { ctx.fillText(`${line.slice(0, -1)}…`, x, y + row * lineHeight, width); return; }
      ctx.fillText(line, x, y + row++ * lineHeight, width); line = character === '\n' ? '' : character;
    } else line += character;
  }
  if (row < lines) ctx.fillText(line, x, y + row * lineHeight, width);
}

/** Draws the same board surface in the enlarged editor and in the office texture. */
export function drawBoard(ctx: CanvasRenderingContext2D, entries: BoardEntry[], width: number, height: number) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = BOARD_SURFACE; ctx.fillRect(0, 0, width, height);
  const scale = width / BOARD_WIDTH;
  const ordered = getBoardPaintOrder(entries);
  paintBoardDrawing(ctx, ordered.filter(isBoardDrawing), width, height);
  for (const entry of ordered) {
    if (isBoardDrawing(entry)) continue;
    const placement = getBoardPlacement(entry);
    const x = placement.x * width, y = placement.y * height, w = placement.width * width, h = placement.height * height;
    const padding = Math.min(16 * scale, w / 10), font = Math.min(18 * scale, w / 11);
    ctx.save(); ctx.shadowColor = '#354b4526'; ctx.shadowBlur = 7 * scale; ctx.shadowOffsetY = 4 * scale;
    ctx.fillStyle = entry.kind === 'text' ? '#fffdf5' : BOARD_PAPER[entry.color]; ctx.fillRect(x, y, w, h); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#748765'; ctx.beginPath(); ctx.arc(x + w / 2, y + 9 * scale, 4 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.textBaseline = 'top'; ctx.fillStyle = '#3f5548'; ctx.font = `${font}px "Noto Sans KR", sans-serif`;
    if (entry.kind === 'doodle') {
      paintStrokes(ctx, entry.strokes, { x: x + padding, y: y + padding, width: w - padding * 2, height: h - padding * 2 - 32 * scale }, scale);
    } else wrappedText(ctx, entry.text, x + padding, y + 24 * scale, Math.max(1, w - padding * 2), font * 1.55, Math.max(1, Math.floor((h - 66 * scale) / (font * 1.55))));
    ctx.font = `${12 * scale}px "Noto Sans KR", sans-serif`; ctx.fillStyle = '#64735a';
    ctx.fillText(entry.authorName, x + padding, y + h - 23 * scale, Math.max(1, w - padding * 2));
    ctx.restore();
  }
  ctx.restore();
}
