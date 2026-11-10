'use client';
import { ArrowDown, ArrowUp, Minus, Plus, RotateCcw, RotateCw, Scan } from 'lucide-react';
import './camera-controls.css';

export function CameraControls({onZoom,onRotate,onTilt,onReset,disabled=false}: {onZoom:(delta:number)=>void;onRotate:(delta:number)=>void;onTilt:(delta:number)=>void;onReset:()=>void;disabled?:boolean}) {
  return <div className="view-controls camera-controls" aria-label="화면 조작">
    <div className="camera-turn-controls"><button className="icon-button" aria-label="화면 왼쪽으로 회전" title="화면 왼쪽으로 회전" disabled={disabled} onClick={()=>onRotate(-1)}><RotateCcw size={17}/></button><button className="icon-button" aria-label="화면 오른쪽으로 회전" title="화면 오른쪽으로 회전" disabled={disabled} onClick={()=>onRotate(1)}><RotateCw size={17}/></button><button className="icon-button" aria-label="화면 원래 방향" title="화면 원래 방향" disabled={disabled} onClick={onReset}><Scan size={17}/></button></div>
    <div className="camera-tilt-controls"><button className="icon-button" aria-label="시점 위로 올리기" title="시점 위로 올리기" disabled={disabled} onClick={()=>onTilt(1)}><ArrowUp size={17}/></button><button className="icon-button" aria-label="시점 아래로 내리기" title="시점 아래로 내리기" disabled={disabled} onClick={()=>onTilt(-1)}><ArrowDown size={17}/></button></div>
    <div className="camera-zoom-controls"><button className="icon-button" aria-label="확대" disabled={disabled} onClick={()=>onZoom(1)}><Plus size={17}/></button><button className="icon-button" aria-label="축소" disabled={disabled} onClick={()=>onZoom(-1)}><Minus size={17}/></button></div>
  </div>;
}
