import type {ViewportTransform} from './viewport';

/** Shift-drag or middle-drag pans, wheel zoom is handled by the caller. */
export function attachPanGesture(canvas:HTMLCanvasElement,view:ViewportTransform,redraw:()=>void):()=>void{
  let active:number|null=null,lastX=0,lastY=0;
  const down=(event:PointerEvent)=>{
    if(event.button!==1&&!event.shiftKey)return;
    active=event.pointerId;lastX=event.clientX;lastY=event.clientY;
    canvas.setPointerCapture?.(event.pointerId);event.preventDefault();
  };
  const move=(event:PointerEvent)=>{
    if(event.pointerId!==active)return;
    view.pan(event.clientX-lastX,event.clientY-lastY);
    lastX=event.clientX;lastY=event.clientY;redraw();
  };
  const up=(event:PointerEvent)=>{if(event.pointerId===active){active=null;canvas.releasePointerCapture?.(event.pointerId);}};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
  return ()=>{canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);
    canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);};
}
