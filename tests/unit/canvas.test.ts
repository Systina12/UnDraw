import { describe, expect, it, vi } from 'vitest';
import { drawStroke, renderPlane } from '../../src/ui/canvas';
import { ViewportTransform } from '../../src/ui/viewport';
import {drawFittedPlot} from '../../src/ui/plot';
import type {CandidateResult} from '../../src/core/types';

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

  it('plots world points without reordering the drawing path', () => {
    const ctx = {
      save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const view = new ViewportTransform({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 }, 1000, 500);
    drawStroke(ctx, [{ x: -1, y: 1, t: 0 }, { x: 1, y: -1, t: 1 }], view, 2);
    expect(ctx.moveTo).toHaveBeenCalledWith(400, 200);
    expect(ctx.lineTo).toHaveBeenCalledWith(600, 300);
  });
});

it('clips fitted curves and breaks the line between disconnected sample islands',()=>{
  const ctx={save:vi.fn(),restore:vi.fn(),setTransform:vi.fn(),setLineDash:vi.fn(),
    beginPath:vi.fn(),rect:vi.fn(),clip:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn()} as unknown as CanvasRenderingContext2D;
  const view=new ViewportTransform({xMin:-5,xMax:5,yMin:-5,yMax:5},1000,500);
  const result={plot:{x:[-2,-1.9,-1.8,1.8,1.9,2],y:[-1,-1,-1,2,2,2]}} as CandidateResult;
  drawFittedPlot(ctx,result,view,2);
  expect(ctx.rect).toHaveBeenCalledWith(0,0,1000,500);
  expect(ctx.clip).toHaveBeenCalled();
  const atGap=([x,y]:number[])=>Math.abs(x-680)<1e-9&&y===150;
  expect(vi.mocked(ctx.moveTo).mock.calls.some(atGap)).toBe(true);
  expect(vi.mocked(ctx.lineTo).mock.calls.some(atGap)).toBe(false);
  expect(ctx.lineTo).toHaveBeenCalledWith(700,150);
});
