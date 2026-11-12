import type { RoomSession } from './multi-types.ts';
import { roomEndpoint } from './hosting.ts';

const ROOM_CODE=/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
const TOKEN=/^[a-f0-9]{64}$/;
const PLAYER_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SESSION_PREFIX='office-room-session-v1:';
const REQUEST_TIMEOUT=12_000;

export class RoomApiError extends Error {
  code:string;
  status:number;
  constructor(code:string,status:number,message:string) {
    super(message); this.name='RoomApiError'; this.code=code; this.status=status;
  }
}

function record(value:unknown):Record<string,unknown>|null {
  return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}

export function parseRoomCode(input:string):string|null {
  const text=input.trim(), code=text.toUpperCase();
  if(ROOM_CODE.test(code)) return code;
  try {
    const url=new URL(text);
    if(!['http:','https:'].includes(url.protocol)||url.searchParams.getAll('room').length!==1) return null;
    const fromUrl=url.searchParams.get('room')!.trim().toUpperCase();
    return ROOM_CODE.test(fromUrl)?fromUrl:null;
  } catch {return null;}
}

export function roomInviteUrl(code:string,base:string):string {
  const normalized=parseRoomCode(code);
  if(!normalized) throw new RoomApiError('INVALID_ROOM_CODE',400,'참여 코드를 확인해 주세요.');
  try {
    const url=new URL(base);
    if(!['http:','https:'].includes(url.protocol)) throw new Error('Unsupported URL');
    url.username='';url.password='';url.search='';url.hash='';url.searchParams.set('room',normalized);
    return url.toString();
  } catch {throw new RoomApiError('INVALID_INVITE_URL',400,'초대 링크를 만들지 못했어요.');}
}

function validSession(value:unknown):RoomSession|null {
  const data=record(value);
  if(!data||typeof data.code!=='string'||!ROOM_CODE.test(data.code)||typeof data.token!=='string'||!TOKEN.test(data.token)||typeof data.playerId!=='string'||!PLAYER_ID.test(data.playerId)) return null;
  return {code:data.code,token:data.token,playerId:data.playerId};
}

export function readRoomSession(code:string,storage?:Pick<Storage,'getItem'>):RoomSession|null {
  const normalized=parseRoomCode(code); if(!normalized) return null;
  try {
    const text=(storage??globalThis.sessionStorage)?.getItem(SESSION_PREFIX+normalized);
    if(!text) return null;
    const data=record(JSON.parse(text));
    const session=data?.version===1?validSession(data):null;
    return session?.code===normalized?session:null;
  } catch {return null;}
}

export function saveRoomSession(session:RoomSession,storage?:Pick<Storage,'setItem'>):boolean {
  const normalized=validSession(session);if(!normalized) return false;
  try {
    const target=storage??globalThis.sessionStorage;if(!target) return false;
    target.setItem(SESSION_PREFIX+normalized.code,JSON.stringify({version:1,...normalized}));return true;
  } catch {return false;}
}

export function clearRoomSession(code:string,storage?:Pick<Storage,'removeItem'>):boolean {
  const normalized=parseRoomCode(code);if(!normalized) return false;
  try {
    const target=storage??globalThis.sessionStorage;if(!target) return false;
    target.removeItem(SESSION_PREFIX+normalized);return true;
  } catch {return false;}
}

export async function requestRoom<T>(body:unknown,signal?:AbortSignal,resource:'rooms'|'board'='rooms'):Promise<T> {
  if(signal?.aborted) throw new DOMException('Request cancelled','AbortError');
  let payload:string|undefined;
  try {payload=JSON.stringify(body);} catch {throw new RoomApiError('INVALID_REQUEST',400,'요청 내용을 확인해 주세요.');}
  if(payload===undefined) throw new RoomApiError('INVALID_REQUEST',400,'요청 내용을 확인해 주세요.');
  const controller=new AbortController();let timedOut=false;
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
  const timeout=setTimeout(()=>{timedOut=true;controller.abort();},REQUEST_TIMEOUT);
  try {
    const endpoint=roomEndpoint().replace(/\/rooms$/, '/'+resource);
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:payload,signal:controller.signal,cache:'no-store',credentials:endpoint.startsWith('/')?'same-origin':'omit',redirect:'error'});
    let data:unknown;
    try {data=await response.json();} catch {
      if(controller.signal.aborted) throw new DOMException('Request cancelled','AbortError');
      throw new RoomApiError('INVALID_RESPONSE',response.status,'회사 연결이 잠시 원활하지 않아요. 다시 시도해 주세요.');
    }
    const result=record(data);
    if(!result) throw new RoomApiError('INVALID_RESPONSE',response.status,'회사 응답을 확인하지 못했어요. 다시 시도해 주세요.');
    if(!response.ok) {
      const code=typeof result.code==='string'&&/^[A-Z_]{1,40}$/.test(result.code)?result.code:'REQUEST_FAILED';
      const message=typeof result.error==='string'&&result.error.length<=200?result.error:'요청을 처리하지 못했어요. 다시 시도해 주세요.';
      throw new RoomApiError(code,response.status,message);
    }
    return data as T;
  } catch(error) {
    if(signal?.aborted) throw new DOMException('Request cancelled','AbortError');
    if(timedOut) throw new RoomApiError('TIMEOUT',0,'연결이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.');
    if(error instanceof RoomApiError) throw error;
    throw new RoomApiError('NETWORK_ERROR',0,'회사에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
  } finally {clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
}
