export const WORKDAY_STORAGE_KEY = 'office-workday-v1';
export type WorkdaySchedule = { start: string; end: string };
export type WorkdayStatus = { phase: 'before' | 'working' | 'finished'; remainingMinutes: number; hours: number; minutes: number; message: string; endsAt: Date };

let memory: WorkdaySchedule | null = null, lastStored: string | null = null, pending = false;
const clone = (value: WorkdaySchedule | null) => value ? { ...value } : null;

export function timeMinutes(value: unknown): number | null {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes;
}
export function validWorkday(value: unknown): value is WorkdaySchedule {
  if (!value || typeof value !== 'object') return false;
  const input=value as WorkdaySchedule, start=timeMinutes(input.start), end=timeMinutes(input.end);
  return start !== null && end !== null && start !== end;
}
export function getWorkdayStatus(schedule: WorkdaySchedule, now = new Date()): WorkdayStatus {
  if (!validWorkday(schedule) || !Number.isFinite(now.getTime())) throw new RangeError('출근과 퇴근 시간을 확인해 주세요.');
  const start = timeMinutes(schedule.start)!, end = timeMinutes(schedule.end)!;
  const current = now.getHours() * 60 + now.getMinutes(), overnight = end < start;
  const endsAt = new Date(now); endsAt.setHours(Math.floor(end / 60), end % 60, 0, 0);
  let phase: WorkdayStatus['phase'];
  if (overnight) {
    if (current >= start) { phase='working'; endsAt.setDate(endsAt.getDate()+1); }
    else phase=current < end ? 'working' : 'finished';
  } else phase=current < start ? 'before' : current < end ? 'working' : 'finished';
  const remainingMinutes=phase==='finished'?0:Math.max(0,Math.ceil((endsAt.getTime()-now.getTime())/60000));
  const hours=Math.floor(remainingMinutes/60), minutes=remainingMinutes%60;
  return {phase,remainingMinutes,hours,minutes,endsAt,message:phase==='finished'?'퇴근 시간이 지났어요. 오늘도 수고했어요!':`퇴근까지 ${hours}시간 ${String(minutes).padStart(2,'0')}분 남았습니다`};
}
export function readWorkday(storage?: Pick<Storage,'getItem'>): WorkdaySchedule | null {
  let raw:string|null;
  try { const source=storage??globalThis.localStorage; if(!source)return clone(memory); raw=source.getItem(WORKDAY_STORAGE_KEY); }
  catch {return clone(memory);}
  if(pending&&raw===lastStored)return clone(memory);
  lastStored=raw;pending=false;memory=null;
  try{const value:unknown=raw?JSON.parse(raw):null;if(value&&typeof value==='object'&&'version' in value&&value.version===1&&'schedule' in value&&validWorkday(value.schedule))memory={start:value.schedule.start,end:value.schedule.end};}catch{/* A corrupt record is treated as unset. */}
  return clone(memory);
}
export function writeWorkday(schedule: WorkdaySchedule, storage?:Pick<Storage,'setItem'>):boolean {
  if(!validWorkday(schedule))return false;
  memory={...schedule};pending=true;
  try{const destination=storage??globalThis.localStorage;if(!destination)return false;const raw=JSON.stringify({version:1,schedule:memory});destination.setItem(WORKDAY_STORAGE_KEY,raw);lastStored=raw;pending=false;return true;}catch{return false;}
}
export function workdayIsSaved(){return !pending;}
