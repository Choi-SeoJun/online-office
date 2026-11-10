'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock3, Coffee, Pencil, X } from 'lucide-react';
import { getWorkdayStatus, readWorkday, validWorkday, workdayIsSaved, writeWorkday, type WorkdaySchedule } from '@/game/workday';
import './work-clock.css';

export function WorkClock() {
  const [open,setOpen]=useState(false),[editing,setEditing]=useState(false),[schedule,setSchedule]=useState<WorkdaySchedule|null>(null);
  const [start,setStart]=useState('09:00'),[end,setEnd]=useState('18:00'),[now,setNow]=useState(()=>new Date());
  const [saved,setSaved]=useState(true),[error,setError]=useState('');
  const button=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLElement>(null);
  useEffect(()=>{const value=readWorkday();setSchedule(value);setSaved(workdayIsSaved());if(value){setStart(value.start);setEnd(value.end);}},[]);
  useEffect(()=>{
    if(!open)return;
    const tick=()=>setNow(new Date());tick();const timer=setInterval(tick,1000);
    const visibility=()=>{if(!document.hidden)tick();};document.addEventListener('visibilitychange',visibility);
    dialog.current?.querySelector<HTMLElement>(editing?'input':'button')?.focus();
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
  },[open,editing]);
  const close=()=>{setOpen(false);button.current?.focus();};
  const show=()=>{const value=readWorkday();setSchedule(value);setSaved(workdayIsSaved());if(value){setStart(value.start);setEnd(value.end);}setEditing(!value);setError('');setNow(new Date());setOpen(true);};
  const save=(event:React.FormEvent)=>{event.preventDefault();const value={start,end};if(!validWorkday(value)){setError('출근·퇴근 시간을 다르게 입력해 주세요.');return;}setSaved(writeWorkday(value));setSchedule(value);setEditing(false);setError('');setNow(new Date());};
  const status=schedule?getWorkdayStatus(schedule,now):null;
  return <>
    <button ref={button} type="button" className="icon-button work-clock-button" aria-label="출퇴근 시계" title="출퇴근 시계" aria-haspopup="dialog" aria-expanded={open} onClick={()=>open?close():show()}><Clock3 size={19}/></button>
    {open&&createPortal(<div className="work-clock-backdrop" onClick={close} onKeyDown={event=>{
      event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        const nodes=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');if(!nodes?.length)return;
        const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    }}><section ref={dialog} className="work-clock-panel" role="dialog" aria-modal="true" aria-labelledby="work-clock-heading" onClick={event=>event.stopPropagation()}>
      <header><div><Clock3 size={19}/><h2 id="work-clock-heading">{editing?'나의 출퇴근 시간':'퇴근까지, 조금만 더'}</h2></div><button type="button" aria-label="출퇴근 시계 닫기" onClick={close}><X size={18}/></button></header>
      {editing?<form onSubmit={save}><p className="work-clock-intro">내 근무 시간을 정해두면<br/>실제 시간에 맞춰 퇴근까지 세어 드릴게요.</p><div className="work-clock-fields"><label>출근 시간<input type="time" value={start} onChange={event=>setStart(event.target.value)} required/></label><span>—</span><label>퇴근 시간<input type="time" value={end} onChange={event=>setEnd(event.target.value)} required/></label></div><p className="work-clock-night-note">퇴근이 출근보다 이르면 다음 날 퇴근으로 계산해요.</p>{error&&<p role="alert" className="work-clock-error">{error}</p>}<button type="submit" className="work-clock-save"><Check size={16}/>시간 저장하기</button>{schedule&&<button type="button" className="work-clock-cancel" onClick={()=>{setStart(schedule.start);setEnd(schedule.end);setEditing(false);setError('');}}>설정으로 돌아가기</button>}</form>:status&&schedule&&<>
        <div className={`work-clock-countdown ${status.phase==='finished'?'is-finished':''}`}>
          <span>{status.phase==='before'?'아직 출근 전이에요':status.phase==='finished'?'오늘도 수고했어요':'조금씩, 퇴근에 가까워지는 중'}</span>
          {status.phase==='finished'?<Coffee size={47} strokeWidth={1.4}/>:<div className="work-clock-digits"><strong>{status.hours}</strong><i>시간</i><strong>{String(status.minutes).padStart(2,'0')}</strong><i>분</i></div>}
          <p>{status.message}</p>
        </div>
        <div className="work-clock-schedule"><span>출근 <strong>{schedule.start}</strong></span><span>퇴근 <strong>{schedule.end}{schedule.end<schedule.start?' +1일':''}</strong></span><button type="button" onClick={()=>setEditing(true)}><Pencil size={13}/>시간 수정</button></div>
        <p className="work-clock-now">지금 시간 <time dateTime={now.toISOString()}>{now.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time></p>
      </>}
      <p className={`work-clock-private ${saved?'':'save-failed'}`} role="status">{saved?'출퇴근 시간은 이 브라우저에만 저장돼요.':'브라우저에 저장하지 못했어요. 이 창에서만 유지돼요.'}</p>
    </section></div>,document.body)}
  </>;
}
