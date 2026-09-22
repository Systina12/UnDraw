import { describe, expect, it, vi } from 'vitest';
import { renderPlane } from '../../src/ui/canvas';
import { ViewportTransform } from '../../src/ui/viewport';

describe('coordinate plane', () => {
  it('draws both mathematical axes at the viewport origin', () => {
    const ctx = {
      canvas: { width: 2000, height: 1000 },
      save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    renderPlane(ctx, new ViewportTransform({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 }, 1000, 500), 2);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1000, 500);
    expect(ctx.moveTo).toHaveBeenCalledWith(500, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(500, 500);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 250);
    expect(ctx.lineTo).toHaveBeenCalledWith(1000, 250);
    expect(vi.mocked(ctx.stroke).mock.calls.length).toBeLessThan(100);
  });
});
