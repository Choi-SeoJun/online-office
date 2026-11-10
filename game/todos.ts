export const TODOS_STORAGE_KEY='office-todos-v1';
export const TODO_LIMIT=200, TODO_TITLE_LIMIT=200;
export type TodoItem={id:string;title:string;done:boolean;createdAt:number};
let memory:TodoItem[]=[];let lastStored:string|null=null,pending=false;
const copy=(items:TodoItem[])=>items.map(item=>({...item}));
const cleanTitle=(text:string)=>Array.from(text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'')).slice(0,TODO_TITLE_LIMIT).join('').trim();
function normalize(value:unknown):TodoItem[]{
  if(!Array.isArray(value))return[];
  const seen=new Set<string>(),items:TodoItem[]=[];
  for(const item of value){
    if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id||item.id.length>80||seen.has(item.id)||typeof item.title!=='string')continue;
    const title=cleanTitle(item.title);if(!title)continue;
    seen.add(item.id);items.push({id:item.id,title,done:item.done===true,createdAt:typeof item.createdAt==='number'&&Number.isFinite(item.createdAt)?Math.max(0,item.createdAt):0});if(items.length===TODO_LIMIT)break;
  }return items;
}
export function addTodo(items:TodoItem[],title:string,id=crypto.randomUUID(),now=Date.now()):TodoItem[]{
  const text=cleanTitle(title);if(!text||items.length>=TODO_LIMIT||items.some(item=>item.id===id))return items;
  return [...items,{id,title:text,done:false,createdAt:now}];
}
export function editTodo(items:TodoItem[],id:string,title:string):TodoItem[]{const text=cleanTitle(title);return text?items.map(item=>item.id===id?{...item,title:text}:item):items;}
export function toggleTodo(items:TodoItem[],id:string):TodoItem[]{return items.map(item=>item.id===id?{...item,done:!item.done}:item);}
export function deleteTodo(items:TodoItem[],id:string):TodoItem[]{return items.filter(item=>item.id!==id);}
export function readTodos(storage?:Pick<Storage,'getItem'>):TodoItem[]{
  let raw:string|null;
  try{const source=storage??globalThis.localStorage;if(!source)return copy(memory);raw=source.getItem(TODOS_STORAGE_KEY);}catch{return copy(memory);}
  if(pending&&raw===lastStored)return copy(memory);
  lastStored=raw;pending=false;memory=[];
  try{const value:unknown=raw?JSON.parse(raw):null;if(value&&typeof value==='object'&&'version' in value&&value.version===1&&'items' in value)memory=normalize(value.items);}catch{/* Corrupt storage starts an empty personal list. */}
  return copy(memory);
}
export function writeTodos(items:TodoItem[],storage?:Pick<Storage,'setItem'>):boolean{
  memory=normalize(items);pending=true;
  try{const destination=storage??globalThis.localStorage;if(!destination)return false;const raw=JSON.stringify({version:1,items:memory});destination.setItem(TODOS_STORAGE_KEY,raw);lastStored=raw;pending=false;return true;}catch{return false;}
}
export function todosAreSaved(){return !pending;}
