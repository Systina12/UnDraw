import { describe, expect, it, vi } from 'vitest';
import { captureStroke } from '../../src/ui/stroke';
import { ViewportTransform } from '../../src/ui/viewport';
import { attachPanGesture } from '../../src/ui/gestures';

describe('pointer capture', () => {
  it('preserves the sequence of world points and ends on pointerup', () => {
    const completed = vi.fn();
    const drawing = vi.fn();
    const canvas = document.createElement('canvas');
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 100 } as DOMRect);
    const view = new ViewportTransform({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 }, 100, 100);
    const dispose = captureStroke(canvas, view, completed, drawing);
    canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 4, button: 0, clientX: 60, clientY: 70 }));
    canvas.dispatchEvent(Object.assign(new Event('pointermove'), { pointerId: 4, clientX: 80, clientY: 50 }));
    canvas.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 4, clientX: 100, clientY: 70 }));
    expect(completed).toHaveBeenCalledTimes(1);
    expect(completed.mock.calls[0][0].map((p: {x:number;y:number}) => [p.x, p.y])).toEqual([[0, 0], [2, 2], [4, 0]]);
    expect(drawing).toHaveBeenCalled();
    dispose();
  });

  it('cancels the pending stroke and pans when two fingers move together', () => {
    const canvas = document.createElement('canvas');
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    const view = new ViewportTransform({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 }, 100, 100);
    const completed = vi.fn(), cancelled = vi.fn(), redraw = vi.fn();
    const detachStroke = captureStroke(canvas, view, completed, undefined, cancelled);
    const detachPan = attachPanGesture(canvas, view, redraw);
    const touch = (type: string, pointerId: number, clientX: number, clientY: number) =>
      canvas.dispatchEvent(Object.assign(new Event(type), { pointerId, pointerType: 'touch', button: 0, clientX, clientY }));
    touch('pointerdown', 1, 40, 50);
    touch('pointerdown', 2, 60, 50);
    touch('pointermove', 1, 50, 50);
    touch('pointermove', 2, 70, 50);
    touch('pointerup', 1, 50, 50);
    touch('pointerup', 2, 70, 50);
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(completed).not.toHaveBeenCalled();
    expect(view.screenToWorld(60, 50).x).toBeCloseTo(0, 8);
    expect(redraw).toHaveBeenCalled();
    touch('pointerdown', 3, 40, 50);
    touch('pointerup', 3, 60, 50);
    expect(completed).toHaveBeenCalledTimes(1);
    detachStroke();
    detachPan();
  });

  it('zooms around a two-finger gesture without creating a stroke', () => {
    const canvas = document.createElement('canvas');
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    const view = new ViewportTransform({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 }, 100, 100);
    const completed = vi.fn();
    const detachStroke = captureStroke(canvas, view, completed);
    const detachPan = attachPanGesture(canvas, view, vi.fn());
    const touch = (type: string, pointerId: number, clientX: number) =>
      canvas.dispatchEvent(Object.assign(new Event(type), { pointerId, pointerType: 'touch', button: 0, clientX, clientY: 50 }));
    touch('pointerdown', 1, 40);
    touch('pointerdown', 2, 60);
    touch('pointermove', 1, 30);
    touch('pointermove', 2, 70);
    expect(view.current.xMax - view.current.xMin).toBeCloseTo(5, 8);
    touch('pointerup', 1, 30);
    touch('pointerup', 2, 70);
    expect(completed).not.toHaveBeenCalled();
    detachStroke();
    detachPan();
  });
});
