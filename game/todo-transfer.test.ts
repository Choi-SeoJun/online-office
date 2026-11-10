import test from 'node:test';
import assert from 'node:assert/strict';
import { exportTodos, parseTodoImport, mergeTodoImport, TODO_IMPORT_MAX_BYTES } from './todo-transfer.ts';
import { TODO_LIMIT, TODO_TITLE_LIMIT, type TodoItem } from './todos.ts';

const completed:TodoItem={id:'meeting',title:'회의 자료 확인\n한국어와 🌿',done:true,createdAt:1234};
const open:TodoItem={id:'memo',title:'내일 할 일',done:false,createdAt:5678};

test('local backup round trip preserves task text, IDs, completion and timestamps',()=>{
  const backup=exportTodos([completed,open]);
  assert.deepEqual(JSON.parse(backup),{version:1,items:[completed,open]});
  assert.deepEqual(parseTodoImport(backup),[completed,open]);
  assert.deepEqual(parseTodoImport(exportTodos([])),[]);
});

test('import rejects malformed versions and records without changing the current list',()=>{
  const current=[completed];
  const invalid=[
    '{','null','[]','{}',
    JSON.stringify({version:2,items:[open]}),
    JSON.stringify({version:1,items:{}}),
    ...[null,{}, {...open,id:''},{...open,id:'x'.repeat(81)}, {...open,title:''}, {...open,title:'   '},
      {...open,title:'x'.repeat(TODO_TITLE_LIMIT+1)}, {...open,title:'hello\u0000'},
      {...open,done:'true'}, {...open,createdAt:-1}, {...open,createdAt:null},
    ].map(item=>JSON.stringify({version:1,items:[completed,item]})),
    JSON.stringify({version:1,items:[open,{...open,title:'같은 ID'}]}),
    JSON.stringify({version:1,items:Array.from({length:TODO_LIMIT+1},(_,i)=>({...open,id:`task-${i}`}))}),
  ];
  for(const raw of invalid){
    assert.throws(()=>mergeTodoImport(current,parseTodoImport(raw)),Error,raw);
    assert.deepEqual(current,[completed]);
  }
});

test('size validation counts UTF-8 bytes and allows the maximum valid Unicode task set',()=>{
  const largest=Array.from({length:TODO_LIMIT},(_,i)=>({...completed,id:`task-${i}`,title:'🌿'.repeat(TODO_TITLE_LIMIT)}));
  assert.deepEqual(parseTodoImport(exportTodos(largest)),largest);
  assert.throws(()=>parseTodoImport(' '.repeat(TODO_IMPORT_MAX_BYTES+1)),Error);
  const unicode=JSON.stringify({version:1,items:[],extra:'🌿'.repeat(Math.ceil(TODO_IMPORT_MAX_BYTES/4))});
  assert.ok(unicode.length<TODO_IMPORT_MAX_BYTES);
  assert.throws(()=>parseTodoImport(unicode),Error);
});

test('additive import never overwrites edited or completed tasks and repeated imports add nothing',()=>{
  const existing=[{...completed,title:'여기에서 수정한 업무',done:false}];
  const imported=[completed,open];
  const first=mergeTodoImport(existing,imported);
  assert.deepEqual(first,{items:[existing[0],open],added:1,skipped:1});
  assert.deepEqual(existing,[{...completed,title:'여기에서 수정한 업무',done:false}]);
  assert.deepEqual(imported,[completed,open]);
  const second=mergeTodoImport(first.items,imported);
  assert.deepEqual(second,{items:first.items,added:0,skipped:2});
  assert.equal(second.items,first.items);
});

test('capacity overflow rejects the whole import, while duplicate-only imports remain safe when full',()=>{
  const current=Array.from({length:TODO_LIMIT-1},(_,i)=>({...open,id:`current-${i}`}));
  assert.throws(()=>mergeTodoImport(current,[completed,open]),Error);
  assert.equal(current.length,TODO_LIMIT-1);
  assert.ok(current.every(item=>item.id.startsWith('current-')));
  const filled=mergeTodoImport(current,[completed]);
  assert.equal(filled.items.length,TODO_LIMIT);
  assert.deepEqual(filled.items.at(-1),completed);
  assert.deepEqual(mergeTodoImport(filled.items,[completed]),{items:filled.items,added:0,skipped:1});
});

test('unexpected backup properties are not copied into saved tasks',()=>{
  const parsed=parseTodoImport(JSON.stringify({version:1,items:[{...open,privateExtra:'ignore me'}]}));
  assert.deepEqual(parsed,[open]);
  parsed[0].title='수정';
  assert.equal(open.title,'내일 할 일');
});
