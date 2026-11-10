import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorkdayStatus, validWorkday, readWorkday, writeWorkday, workdayIsSaved, WORKDAY_STORAGE_KEY } from './workday.ts';
const at=(hour:number,minute=0,second=0)=>new Date(2026,10,10,hour,minute,second);
test('daytime countdown follows real time before work, at work and after departure',()=>{
  const schedule={start:'09:00',end:'18:00'};
  assert.equal(getWorkdayStatus(schedule,at(8)).phase,'before');
  assert.equal(getWorkdayStatus(schedule,at(8)).remainingMinutes,600);
  assert.equal(getWorkdayStatus(schedule,at(9)).message,'퇴근까지 9시간 00분 남았습니다');
  assert.equal(getWorkdayStatus(schedule,at(17,59,59)).remainingMinutes,1);
  assert.equal(getWorkdayStatus(schedule,at(18)).phase,'finished');
  assert.equal(getWorkdayStatus(schedule,at(21)).remainingMinutes,0);
});
test('overnight shifts count to the correct calendar day and stop at the configured end',()=>{
  const schedule={start:'22:00',end:'06:30'};
  const late=getWorkdayStatus(schedule,at(23));
  assert.equal(late.remainingMinutes,450);assert.equal(late.endsAt.getDate(),11);
  const early=getWorkdayStatus(schedule,at(2));
  assert.equal(early.remainingMinutes,270);assert.equal(early.endsAt.getDate(),10);
  assert.equal(getWorkdayStatus(schedule,at(6,30)).phase,'finished');
  assert.equal(getWorkdayStatus(schedule,at(14)).phase,'finished');
});
test('invalid clock inputs cannot create negative or ambiguous countdowns',()=>{
  for(const value of [null,{}, {start:'9:00',end:'18:00'},{start:'24:00',end:'18:00'},{start:'09:00',end:'09:00'},{start:'09:60',end:'18:00'}])assert.equal(validWorkday(value),false);
  assert.throws(()=>getWorkdayStatus({start:'09:00',end:'18:00'},new Date(NaN)));
});
test('clock settings persist without exposing unrelated personal state and survive blocked storage honestly',()=>{
  let stored:string|null=null;
  const storage={getItem:()=>stored,setItem:(key:string,raw:string)=>{assert.equal(key,WORKDAY_STORAGE_KEY);stored=raw;}};
  assert.equal(readWorkday(storage),null);
  assert.equal(writeWorkday({start:'08:30',end:'17:30'},storage),true);
  assert.deepEqual(readWorkday(storage),{start:'08:30',end:'17:30'});
  assert.equal(writeWorkday({start:'10:00',end:'19:00'},{setItem(){throw new Error('quota');}}),false);
  assert.equal(workdayIsSaved(),false);
  assert.deepEqual(readWorkday(storage),{start:'10:00',end:'19:00'});
  stored='{"version":1,"schedule":{"start":"07:00","end":"16:00"}}';
  assert.deepEqual(readWorkday(storage),{start:'07:00',end:'16:00'});
  stored='{';assert.equal(readWorkday(storage),null);
});
