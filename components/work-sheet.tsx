'use client';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, PencilLine } from 'lucide-react';
import { createWorkSheet, readWorkSheet, updateWorkSheet, writeWorkSheet, WORKSHEET_MAX_LENGTH } from '@/game/worksheet';
import './work-sheet.css';

export function WorkSheet({ onType }: { onType: (key: string) => void }) {
  const [cells, setCells] = useState(createWorkSheet), [active, setActive] = useState({ row: 3, column: 2 });
  const [loaded, setLoaded] = useState(false), [saved, setSaved] = useState(true);
  const inputs = useRef<(HTMLInputElement | null)[][]>([]);
  useEffect(() => { setCells(readWorkSheet()); setLoaded(true); }, []);
  useEffect(() => { if (loaded) setSaved(writeWorkSheet(cells)); }, [cells, loaded]);
  const edit = (row: number, column: number, value: string) => setCells(previous => updateWorkSheet(previous, row, column, value));
  const key = (event: KeyboardEvent<HTMLInputElement>, row: number, column: number) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.key === 'Process' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length === 1 || ['Backspace', 'Delete', 'Enter', 'Tab'].includes(event.key)) onType(event.key);
    if (event.key === 'Enter') {
      event.preventDefault();
      const next = (row + (event.shiftKey ? 4 : 1)) % 5;
      inputs.current[next]?.[column]?.focus();
    }
  };
  const address = `${String.fromCharCode(65 + active.column)}${active.row + 1}`;
  return <div className="work-sheet" onKeyDown={event => event.stopPropagation()}>
    <div className="work-sheet-toolbar"><span><PencilLine size={12} />업무 시트</span><span className="work-sheet-save" role="status">{loaded && saved ? <><Check size={10} />저장됨</> : '이 창에서 편집 중'}</span></div>
    <div className="work-sheet-formula"><span aria-hidden="true">{address}</span><em aria-hidden="true">fx</em><input aria-label={`${address} 내용 편집`} value={cells[active.row][active.column]} maxLength={WORKSHEET_MAX_LENGTH} onChange={event => edit(active.row, active.column, event.target.value)} onKeyDown={event => key(event, active.row, active.column)} onCompositionEnd={() => onType('a')} spellCheck={false} autoComplete="off" /></div>
    <table aria-label="직접 편집하는 월간 업무 현황"><thead><tr><th aria-label="행 번호" /><th scope="col">A</th><th scope="col">B</th><th scope="col">C</th></tr></thead><tbody>{cells.map((row, r) => <tr key={r}><th scope="row">{r + 1}</th>{row.map((value, c) => <td key={c} className={active.row === r && active.column === c ? 'work-sheet-active' : ''}><input ref={element => { inputs.current[r] ??= []; inputs.current[r][c] = element; }} aria-label={`${String.fromCharCode(65 + c)}${r + 1}`} value={value} title={value} maxLength={WORKSHEET_MAX_LENGTH} onFocus={() => setActive({row:r,column:c})} onChange={event => edit(r, c, event.target.value)} onKeyDown={event => key(event, r, c)} onCompositionEnd={() => onType('a')} spellCheck={false} autoComplete="off" /></td>)}</tr>)}</tbody></table>
    <div className="work-sheet-footer"><span>Sheet 1</span><span>칸을 눌러 입력 · Enter 다음 행</span></div>
    <p className="work-sheet-note">{saved ? '내용은 이 브라우저에만 저장돼요.' : '현재 탭에서만 유지돼요. 새로고침하면 초기화돼요.'}</p>
  </div>;
}
