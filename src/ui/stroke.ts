import type { Point } from '../core/types';
import type { ViewportTransform } from './viewport';

export function captureStroke(canvas: HTMLCanvasElement, transform: ViewportTransform,
  onComplete: (points: Point[]) => void, onDraw?: (points: Point[]) => void): () => void {
  let active: number | null = null;
  let points: Point[] = [];

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
    onDraw?.([...points]);
  };

  const down = (event: PointerEvent) => {
    if (active !== null || event.button !== 0 || event.shiftKey) return;
    active = event.pointerId;
    points = [];
    canvas.setPointerCapture?.(event.pointerId);
    append(event);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId === active) append(event);
  };
  const finish = (event: PointerEvent) => {
    if (event.pointerId !== active) return;
    append(event);
    canvas.releasePointerCapture?.(event.pointerId);
    active = null;
    onComplete([...points]);
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
