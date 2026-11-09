export const WORKSHEET_KEY = 'office-work-sheet-v1';
export const WORKSHEET_MAX_LENGTH = 80;
export type WorkSheetCells = string[][];

// Survives leaving the desk or changing floors even when browser storage fails.
// Keep the last observed stored value so a quota failure does not resurrect an
// older save, while a genuine change from another tab is still respected.
let memoryCells: WorkSheetCells | null = null;
let lastStored: string | null = null;
let pendingSave = false;

export function createWorkSheet(): WorkSheetCells {
  return [
    ['이번 주 할 일', '상태', '메모'],
    ['시장 조사', '검토 중', '—'],
    ['자료 정리', '검토 중', '—'],
    ['집중하는 척', '검토 중', '완벽'],
    ['커피 마시기', '아주 중요', '—'],
  ];
}

function normalize(cells: unknown): WorkSheetCells {
  return createWorkSheet().map((row, r) => row.map((fallback, c) => {
    const value = Array.isArray(cells) && Array.isArray(cells[r]) ? cells[r][c] : undefined;
    return typeof value === 'string' ? value.slice(0, WORKSHEET_MAX_LENGTH) : fallback;
  }));
}

export function readWorkSheet(storage?: Pick<Storage, 'getItem'>): WorkSheetCells {
  let value: string | null;
  try {
    const source = storage ?? globalThis.localStorage;
    if (!source) return normalize(memoryCells);
    value = source.getItem(WORKSHEET_KEY);
  } catch { return normalize(memoryCells); }
  if (pendingSave && value === lastStored) return normalize(memoryCells);
  lastStored = value; pendingSave = false; memoryCells = createWorkSheet();
  try {
    if (!value) return normalize(memoryCells);
    const saved: unknown = JSON.parse(value);
    if (saved && typeof saved === 'object' && 'version' in saved && saved.version === 1 && 'cells' in saved) memoryCells = normalize(saved.cells);
  } catch { /* Invalid external records safely become the default sheet. */ }
  return normalize(memoryCells);
}

export function updateWorkSheet(cells: WorkSheetCells, row: number, column: number, text: string): WorkSheetCells {
  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= 5 || column < 0 || column >= 3) return cells;
  return cells.map((values, r) => r === row ? values.map((value, c) => c === column ? text.slice(0, WORKSHEET_MAX_LENGTH) : value) : values);
}

export function writeWorkSheet(cells: WorkSheetCells, storage?: Pick<Storage, 'setItem'>): boolean {
  memoryCells = normalize(cells); pendingSave = true;
  try {
    const destination = storage ?? globalThis.localStorage;
    if (!destination) return false;
    const value = JSON.stringify({ version: 1, cells: memoryCells });
    destination.setItem(WORKSHEET_KEY, value);
    lastStored = value; pendingSave = false;
    return true;
  } catch { return false; }
}

export function resetWorkSheet(storage?: Pick<Storage, 'removeItem'>): boolean {
  memoryCells = createWorkSheet(); pendingSave = true;
  try {
    const destination = storage ?? globalThis.localStorage;
    if (!destination) return false;
    destination.removeItem(WORKSHEET_KEY);
    lastStored = null; pendingSave = false;
    return true;
  } catch { return false; }
}
