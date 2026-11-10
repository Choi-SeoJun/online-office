'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, ClipboardList, ListTodo, Maximize2, Minus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { addTodo, deleteTodo, editTodo, readTodos, todosAreSaved, toggleTodo, writeTodos, TODO_LIMIT, TODO_TITLE_LIMIT, TODOS_STORAGE_KEY, type TodoItem } from '@/game/todos';
import { exportTodos, mergeTodoImport, parseTodoImport, TodoImportError, TODO_IMPORT_MAX_BYTES } from '@/game/todo-transfer';
import './todo-board.css';

export function TodoBoard({onType,onClose}:{onType?:(key:string)=>void;onClose?:()=>void}) {
  const [items,setItems]=useState<TodoItem[]>([]),[draft,setDraft]=useState(''),[loaded,setLoaded]=useState(false),[saved,setSaved]=useState(true);
  const [filter,setFilter]=useState<'all'|'open'|'done'>('all'),[editing,setEditing]=useState<string|null>(null),[editDraft,setEditDraft]=useState(''),[minimized,setMinimized]=useState(false);
  const [importing,setImporting]=useState(false),[transferStatus,setTransferStatus]=useState<{text:string;error:boolean}|null>(null);
  const addInput=useRef<HTMLInputElement>(null),editInput=useRef<HTMLTextAreaElement>(null),fileInput=useRef<HTMLInputElement>(null),externalUpdate=useRef(false),latestItems=useRef<TodoItem[]>([]);
  useEffect(()=>{setItems(readTodos());setSaved(todosAreSaved());setLoaded(true);const external=(event:StorageEvent)=>{if(event.key!==TODOS_STORAGE_KEY&&event.key!==null)return;externalUpdate.current=true;setItems(readTodos());setSaved(todosAreSaved());};window.addEventListener('storage',external);return()=>window.removeEventListener('storage',external);},[]);
  useEffect(()=>{latestItems.current=items;if(!loaded)return;if(externalUpdate.current){externalUpdate.current=false;return;}setSaved(writeTodos(items));},[items,loaded]);
  useEffect(()=>{if(editing)editInput.current?.focus();},[editing]);
  const keyboard=(event:React.KeyboardEvent<HTMLInputElement|HTMLTextAreaElement>)=>{const composing=event.nativeEvent.isComposing||event.nativeEvent.keyCode===229;if(composing&&event.key==='Enter')event.preventDefault();if(!composing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.key.length===1||['Backspace','Delete','Enter'].includes(event.key)))onType?.(event.key);};
  const add=(event:React.FormEvent)=>{event.preventDefault();if(!draft.trim()||items.length>=TODO_LIMIT)return;setItems(current=>addTodo(current,draft));setDraft('');setFilter('open');addInput.current?.focus();};
  const saveEdit=(event?:React.FormEvent)=>{event?.preventDefault();if(!editing||!editDraft.trim())return;setItems(current=>editTodo(current,editing,editDraft));setEditing(null);setEditDraft('');};
  const download=()=>{
    let url:string|undefined;
    try{
      url=URL.createObjectURL(new Blob([exportTodos(items)],{type:'application/json;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download=`office-todos-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);try{link.click();}finally{link.remove();}
      setTransferStatus({text:`할 일 ${items.length}개의 다운로드를 시작했어요. 새 주소에서 이 파일을 가져오세요.`,error:false});
    }catch{setTransferStatus({text:'파일을 내려받지 못했어요. 다시 시도해 주세요.',error:true});}
    finally{if(url){const downloadUrl=url;window.setTimeout(()=>URL.revokeObjectURL(downloadUrl),1000);}}
  };
  const importFile=async(event:React.ChangeEvent<HTMLInputElement>)=>{
    const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;
    setImporting(true);setTransferStatus(null);
    try{
      if(file.size>TODO_IMPORT_MAX_BYTES)throw new TodoImportError('파일이 너무 커요. 256KB 이하의 할 일 파일을 선택해 주세요.');
      const incoming=parseTodoImport(await file.text());
      // Use the latest list so edits made while the file was being read survive.
      const result=mergeTodoImport(latestItems.current,incoming);
      setItems(result.items);if(result.added)setFilter('all');
      setTransferStatus({text:result.added?`${result.added}개를 가져왔어요.${result.skipped?` 이미 있는 ${result.skipped}개는 현재 내용을 유지했어요.`:''}`:result.skipped?'모두 이미 있는 할 일이에요. 현재 내용을 유지했어요.':'파일에 가져올 할 일이 없어요.',error:false});
    }catch(error){setTransferStatus({text:error instanceof TodoImportError?error.message:'파일을 읽지 못했어요. 다시 선택해 주세요.',error:true});}
    finally{setImporting(false);}
  };
  const done=items.filter(item=>item.done).length,visible=items.filter(item=>filter==='all'||(filter==='done'?item.done:!item.done));
  if(minimized)return <button type="button" className="todo-reopen" onClick={()=>setMinimized(false)}><ListTodo size={17}/>할 일 목록 열기<Maximize2 size={14}/></button>;
  return <section className="todo-board" aria-label="나의 할 일 목록" onKeyDown={event=>event.stopPropagation()}>
    <header className="todo-header"><div className="todo-heading"><span><ClipboardList size={22} strokeWidth={1.6}/></span><div><p>MY WORKSPACE</p><h2>오늘의 할 일</h2></div></div><div className="todo-header-tools"><span className={saved?'todo-save-state':'todo-save-state not-saved'} role="status">{loaded&&saved?<><Check size={12}/>저장됨</>:'이 창에서 작성 중'}</span><button type="button" aria-label={onClose?'할 일 목록 닫기':'할 일 목록 최소화'} onClick={()=>onClose?onClose():setMinimized(true)}>{onClose?<X size={19}/>:<Minus size={19}/>}</button></div></header>
    <div className="todo-progress"><span><strong>{done}</strong> / {items.length} 완료</span><div role="progressbar" aria-label="할 일 완료율" aria-valuenow={items.length?Math.round(done/items.length*100):0} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${items.length?done/items.length*100:0}%`}}/></div><em>{items.length&&done===items.length?'오늘도 하나씩 해냈어요.':'작은 일부터, 하나씩.'}</em></div>
    <form className="todo-add" onSubmit={add}><Plus size={19}/><input ref={addInput} aria-label="새 할 일" value={draft} maxLength={TODO_TITLE_LIMIT} disabled={items.length>=TODO_LIMIT} onChange={event=>setDraft(event.target.value)} onKeyDown={keyboard} onCompositionEnd={()=>onType?.('a')} placeholder={items.length>=TODO_LIMIT?'할 일은 200개까지 저장할 수 있어요.':'해야 할 일을 적고 Enter를 눌러요'} autoComplete="off"/><button type="submit" disabled={!draft.trim()||items.length>=TODO_LIMIT}>추가</button></form>
    <div className="todo-tabs" role="tablist" aria-label="할 일 보기"><button type="button" role="tab" aria-selected={filter==='all'} onClick={()=>setFilter('all')}>전체 <span>{items.length}</span></button><button type="button" role="tab" aria-selected={filter==='open'} onClick={()=>setFilter('open')}>할 일 <span>{items.length-done}</span></button><button type="button" role="tab" aria-selected={filter==='done'} onClick={()=>setFilter('done')}>완료 <span>{done}</span></button></div>
    <div className="todo-list-scroll"><ul className="todo-list">{visible.map(item=><li key={item.id} className={item.done?'todo-item is-done':'todo-item'}>
      <button type="button" className="todo-check" role="checkbox" aria-checked={item.done} aria-label={`${item.title} ${item.done?'완료 취소':'완료 표시'}`} onClick={()=>setItems(current=>toggleTodo(current,item.id))}>{item.done&&<Check size={17} strokeWidth={2.1}/>}</button>
      {editing===item.id?<form className="todo-edit" onSubmit={saveEdit}><textarea ref={editInput} aria-label="할 일 수정" value={editDraft} maxLength={TODO_TITLE_LIMIT} rows={2} onChange={event=>setEditDraft(event.target.value)} onKeyDown={event=>{keyboard(event);if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();saveEdit();}if(event.key==='Escape'){event.preventDefault();setEditing(null);}}} onCompositionEnd={()=>onType?.('a')}/><div><button type="button" onClick={()=>setEditing(null)}>취소</button><button type="submit" disabled={!editDraft.trim()}>저장</button></div></form>:<><span className="todo-title">{item.title}</span><div className="todo-item-tools"><button type="button" aria-label={`${item.title} 수정`} onClick={()=>{setEditing(item.id);setEditDraft(item.title);}}><Pencil size={15}/></button><button type="button" aria-label={`${item.title} 삭제`} onClick={()=>setItems(current=>deleteTodo(current,item.id))}><Trash2 size={15}/></button></div></>}
    </li>)}</ul>{!visible.length&&<div className="todo-empty">{filter==='done'?<CheckCheck size={38} strokeWidth={1.3}/>:<ClipboardList size={38} strokeWidth={1.3}/>}<strong>{filter==='done'?'완료한 일은 여기에 모여요':filter==='open'&&items.length?'남은 일을 모두 마쳤어요':'오늘 할 일을 적어볼까요?'}</strong><p>{filter==='done'?'할 일을 끝내면 왼쪽 동그라미를 눌러 주세요.':filter==='open'&&items.length?'잠깐 숨을 돌려도 좋아요.':'회의 준비부터 작은 메모까지, 편하게 남겨두세요.'}</p></div>}</div>
    <footer className="todo-footer"><div className="todo-footer-note"><span>{saved?'내 할 일은 이 브라우저에만 저장되고 동료에게 공유되지 않아요.':'저장 공간을 사용할 수 없어 이 창에서만 유지돼요. 새로고침하면 사라질 수 있어요.'}</span><small>{items.length}/{TODO_LIMIT}</small></div><div className="todo-transfer-actions"><button type="button" disabled={!loaded} onClick={download} title="할 일을 JSON 파일로 저장">내보내기</button><button type="button" disabled={!loaded||importing} onClick={()=>fileInput.current?.click()} title="파일의 할 일을 현재 목록에 추가">{importing?'가져오는 중…':'가져오기'}</button><input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="가져올 할 일 파일" onChange={importFile}/></div>{transferStatus&&<p className={transferStatus.error?'todo-transfer-status is-error':'todo-transfer-status'} role="status">{transferStatus.text}</p>}</footer>
  </section>;
}
