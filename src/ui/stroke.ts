import type { Point } from '../core/types';
import type { ViewportTransform } from './viewport';

export function captureStroke(canvas: HTMLCanvasElement, transform: ViewportTransform,
  onComplete: (points: Point[]) => void, onDraw?: (points: Point[], source: PointerEvent) => void,
  onCancel?: () => void,canDraw: (event: PointerEvent) => boolean=()=>true): () => void {
  let active: number | null = null;
  let points: Point[] = [];
  const touches = new Set<number>();
  let touchPanning = false;

  const cancel = () => {
    if (active === null) return;
    canvas.releasePointerCapture?.(active);
    active = null;
    points = [];
    onCancel?.();
  };

  const append = (event: PointerEvent) => {
    const events = typeof event.getCoalescedEvents === 'function'
      ? [...event.getCoalescedEvents(), event] : [event];
    const rect = canvas.getBoundingClientRect();
    for (const sample of events) {
      const pixelX = sample.clientX - rect.left;
      const pixelY = sample.clientY - rect.top;
      const last = points.at(-1);
      if (last) {
        const screen = transform.worldToScreen(last.x, last.y);
        if (Math.hypot(pixelX - screen.x, pixelY - screen.y) < .5) continue;
      }
      const { x, y } = transform.screenToWorld(pixelX, pixelY);
      points.push({ x, y, t: sample.timeStamp });
    }
    onDraw?.([...points], event);
  };

  const down = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      touches.add(event.pointerId);
      if (touches.size > 1) {
        touchPanning = true;
        cancel();
      }
      if (touchPanning) return;
    }
    if (active !== null || event.button !== 0 || event.shiftKey || !canDraw(event)) return;
    active = event.pointerId;
    points = [];
    canvas.setPointerCapture?.(event.pointerId);
    append(event);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId === active) append(event);
  };
  const finish = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      touches.delete(event.pointerId);
      if (touches.size === 0) touchPanning = false;
    }
    if (event.pointerId !== active) return;
    append(event);
    canvas.releasePointerCapture?.(event.pointerId);
    active = null;
    const distance = points.slice(1).reduce((sum,point,i)=>{
      const a=transform.worldToScreen(points[i].x,points[i].y);
      const b=transform.worldToScreen(point.x,point.y);
      return sum+Math.hypot(b.x-a.x,b.y-a.y);
    },0);
    if(points.length>=8||distance>=4)onComplete([...points]);
    else onCancel?.();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', finish);
    canvas.removeEventListener('pointercancel', finish);
  };
}
