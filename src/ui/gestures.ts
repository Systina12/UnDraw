import type {ViewportTransform} from './viewport';

/** Shift/middle drag and two-finger movement pan; a two-finger pinch zooms. */
export function attachPanGesture(canvas:HTMLCanvasElement,view:ViewportTransform,redraw:()=>void):()=>void{
  let active:number|null=null,lastX=0,lastY=0;
  const touches=new Map<number,{x:number;y:number}>();
  let midX=0,midY=0,distance=0;
  const measure=()=>{
    const [first,second]=[...touches.values()];
    return {x:(first.x+second.x)/2,y:(first.y+second.y)/2,
      distance:Math.hypot(second.x-first.x,second.y-first.y)};
  };
  const down=(event:PointerEvent)=>{
    if(event.pointerType==='touch'){
      touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
      canvas.setPointerCapture?.(event.pointerId);
      if(touches.size===2){
        for(const id of touches.keys())canvas.setPointerCapture?.(id);
        const position=measure();midX=position.x;midY=position.y;distance=position.distance;
        event.preventDefault();
      }
      return;
    }
    if(event.button!==1&&!event.shiftKey)return;
    active=event.pointerId;lastX=event.clientX;lastY=event.clientY;
    canvas.setPointerCapture?.(event.pointerId);event.preventDefault();
  };
  const move=(event:PointerEvent)=>{
    if(event.pointerType==='touch'){
      if(!touches.has(event.pointerId))return;
      touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(touches.size<2)return;
      const position=measure();
      view.pan(position.x-midX,position.y-midY);
      if(position.distance>0&&distance>0){
        const rect=canvas.getBoundingClientRect();
        view.zoomAt(position.x-rect.left,position.y-rect.top,position.distance/distance);
      }
      midX=position.x;midY=position.y;distance=position.distance;
      redraw();
      return;
    }
    if(event.pointerId!==active)return;
    view.pan(event.clientX-lastX,event.clientY-lastY);
    lastX=event.clientX;lastY=event.clientY;redraw();
  };
  const up=(event:PointerEvent)=>{
    if(event.pointerType==='touch'&&touches.delete(event.pointerId)){
      canvas.releasePointerCapture?.(event.pointerId);
      if(touches.size>=2){const position=measure();midX=position.x;midY=position.y;distance=position.distance;}
    }
    if(event.pointerId===active){active=null;canvas.releasePointerCapture?.(event.pointerId);}
  };
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
  return ()=>{canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);
    canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);};
}
