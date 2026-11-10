'use client';
import { Minus, Plus } from 'lucide-react';
import './camera-controls.css';

export function CameraControls({onZoom,disabled=false}: {onZoom:(delta:number)=>void;disabled?:boolean}) {
  return <div className="view-controls camera-controls" aria-label="화면 확대·축소">
    <div className="camera-zoom-controls"><button className="icon-button" aria-label="확대" disabled={disabled} onClick={()=>onZoom(1)}><Plus size={17}/></button><button className="icon-button" aria-label="축소" disabled={disabled} onClick={()=>onZoom(-1)}><Minus size={17}/></button></div>
  </div>;
}
