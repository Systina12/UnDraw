import { describe, expect, it, vi } from 'vitest';
import { captureStroke } from '../../src/ui/stroke';
import { ViewportTransform } from '../../src/ui/viewport';

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
});
