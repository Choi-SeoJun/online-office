import { TODO_LIMIT, TODO_TITLE_LIMIT, type TodoItem } from './todos.ts';

export const TODO_IMPORT_MAX_BYTES=256*1024;
export class TodoImportError extends Error {}
const invalidFile=()=>new TodoImportError('올바른 할 일 파일이 아니에요. 내보내기로 받은 JSON 파일을 선택해 주세요.');
const isRecord=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function exportTodos(items:TodoItem[]):string{
  return JSON.stringify({version:1,items:items.map(({id,title,done,createdAt})=>({id,title,done,createdAt}))},null,2);
}

export function parseTodoImport(raw:string):TodoItem[]{
  if(new TextEncoder().encode(raw).byteLength>TODO_IMPORT_MAX_BYTES)throw new TodoImportError('파일이 너무 커요. 256KB 이하의 할 일 파일을 선택해 주세요.');
  let value:unknown;
  try{value=JSON.parse(raw);}catch{throw invalidFile();}
  if(!isRecord(value)||!Array.isArray(value.items))throw invalidFile();
  if(value.version!==1)throw new TodoImportError('지원하지 않는 파일 버전이에요. 할 일 목록에서 다시 내보내 주세요.');
  if(value.items.length>TODO_LIMIT)throw new TodoImportError(`한 파일에는 할 일을 ${TODO_LIMIT}개까지 담을 수 있어요.`);
  const seen=new Set<string>();
  return value.items.map((item:unknown)=>{
    if(!isRecord(item)||typeof item.id!=='string'||!item.id||item.id.length>80||seen.has(item.id)
      ||typeof item.title!=='string'||!item.title.trim()||Array.from(item.title).length>TODO_TITLE_LIMIT
      ||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item.title)
      ||typeof item.done!=='boolean'||typeof item.createdAt!=='number'||!Number.isFinite(item.createdAt)||item.createdAt<0)throw invalidFile();
    seen.add(item.id);
    return {id:item.id,title:item.title,done:item.done,createdAt:item.createdAt};
  });
}

export function mergeTodoImport(current:TodoItem[],incoming:TodoItem[]):{items:TodoItem[];added:number;skipped:number}{
  const seen=new Set(current.map(item=>item.id)),additions:TodoItem[]=[];
  for(const item of incoming){
    if(seen.has(item.id))continue;
    seen.add(item.id);additions.push({...item});
  }
  if(current.length+additions.length>TODO_LIMIT)throw new TodoImportError(`할 일은 ${TODO_LIMIT}개까지 저장할 수 있어요. ${additions.length}개를 추가할 공간이 부족해 기존 목록을 유지했어요.`);
  return {items:additions.length?[...current,...additions]:current,added:additions.length,skipped:incoming.length-additions.length};
}
