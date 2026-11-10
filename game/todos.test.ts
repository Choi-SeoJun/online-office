import test from 'node:test';
import assert from 'node:assert/strict';
import { addTodo,editTodo,toggleTodo,deleteTodo,readTodos,writeTodos,todosAreSaved,TODO_LIMIT,TODO_TITLE_LIMIT,TODOS_STORAGE_KEY } from './todos.ts';
test('personal tasks can be added, edited, completed, reopened and deleted without mutating previous lists',()=>{
  const empty:ReturnType<typeof readTodos>=[];
  const added=addTodo(empty,'  회의 자료 정리  ','first',123);assert.equal(empty.length,0);assert.equal(added[0].title,'회의 자료 정리');
  const edited=editTodo(added,'first','오후 회의 자료 정리');assert.equal(added[0].title,'회의 자료 정리');
  const completed=toggleTodo(edited,'first');assert.equal(completed[0].done,true);assert.equal(toggleTodo(completed,'first')[0].done,false);
  assert.equal(editTodo(edited,'first','   ')[0].title,'오후 회의 자료 정리');assert.equal(deleteTodo(completed,'first').length,0);
});
test('task limits preserve valid Unicode and prevent blank or duplicate entries',()=>{
  const long=addTodo([],'😀'.repeat(250),'emoji');assert.equal(Array.from(long[0].title).length,TODO_TITLE_LIMIT);assert.ok(!long[0].title.includes('\ufffd'));
  assert.equal(addTodo(long,'duplicate','emoji'),long);assert.equal(addTodo(long,'   ','blank'),long);
  let items:ReturnType<typeof readTodos>=[];for(let i=0;i<201;i++)items=addTodo(items,`할 일 ${i}`,`id-${i}`);assert.equal(items.length,TODO_LIMIT);
});
test('saved tasks round trip and malformed records cannot inject fields or unbounded lists',()=>{
  let raw:string|null=null;const storage={getItem:()=>raw,setItem:(key:string,value:string)=>{assert.equal(key,TODOS_STORAGE_KEY);raw=value;}};
  const items=toggleTodo(addTodo([],'한국어 할 일','abc',100),'abc');assert.equal(writeTodos(items,storage),true);assert.deepEqual(readTodos(storage),items);
  raw=JSON.stringify({version:1,items:[{id:'same',title:'첫 업무',done:'yes',createdAt:1,secret:'x'},{id:'same',title:'중복',done:true},{id:'empty',title:'  '},...Array.from({length:300},(_,i)=>({id:`x-${i}`,title:'업무',done:false}))]});
  const restored=readTodos(storage);assert.equal(restored.length,TODO_LIMIT);assert.equal(restored[0].done,false);assert.equal('secret' in restored[0],false);
  for(const invalid of ['{','null','[]','{"version":2,"items":[]}']){raw=invalid;assert.deepEqual(readTodos(storage),[]);}
});
test('failed saves retain current edits across remounts but honor newer external storage',()=>{
  let raw:string|null=JSON.stringify({version:1,items:[{id:'old',title:'오래된 할 일',done:false,createdAt:1}]});const storage={getItem:()=>raw};
  const old=readTodos(storage),newer=editTodo(old,'old','최신 업무');
  assert.equal(writeTodos(newer,{setItem(){throw new Error('quota');}}),false);assert.equal(todosAreSaved(),false);assert.deepEqual(readTodos(storage),newer);
  assert.deepEqual(readTodos({getItem(){throw new Error('blocked');}}),newer);
  raw=JSON.stringify({version:1,items:[{id:'other',title:'다른 탭의 업무',done:true,createdAt:2}]});assert.equal(readTodos(storage)[0].id,'other');assert.equal(todosAreSaved(),true);
});
