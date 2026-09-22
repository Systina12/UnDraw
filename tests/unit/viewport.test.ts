import { describe, expect, it } from 'vitest';
import { ViewportTransform } from '../../src/ui/viewport';

const initial = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };

describe('ViewportTransform', () => {
  it('maps the center of a rectangular canvas to the origin', () => {
    const view = new ViewportTransform(initial, 1000, 500);
    expect(view.screenToWorld(500, 250)).toEqual({ x: 0, y: 0 });
    expect(view.worldToScreen(0, 0)).toEqual({ x: 500, y: 250 });
    expect(view.screenToWorld(0, 0)).toEqual({ x: -5, y: 5 });
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const view = new ViewportTransform(initial, 1000, 500);
    const world = view.screenToWorld(300, 200);
    view.zoomAt(300, 200, 2);
    expect(view.screenToWorld(300, 200).x).toBeCloseTo(world.x, 12);
    expect(view.screenToWorld(300, 200).y).toBeCloseTo(world.y, 12);
    expect(view.worldToScreen(world.x, world.y).x).toBeCloseTo(300, 12);
    expect(view.worldToScreen(world.x, world.y).y).toBeCloseTo(200, 12);
  });

  it('pans in pixels and resets exactly to the default view', () => {
    const view = new ViewportTransform(initial, 1000, 500);
    view.pan(100, -50);
    expect(view.screenToWorld(500, 250)).toEqual({ x: -1, y: -1 });
    view.reset();
    expect(view.screenToWorld(500, 250)).toEqual({ x: 0, y: 0 });
  });

  it('limits zoom to a finite span and rejects unusable geometry', () => {
    const view = new ViewportTransform(initial, 1000, 500);
    view.zoomAt(500, 250, Number.POSITIVE_INFINITY);
    expect(view.current.xMax - view.current.xMin).toBe(10);
    view.zoomAt(500, 250, 1e30);
    expect(view.current.xMax - view.current.xMin).toBeCloseTo(1e-3, 12);
    view.zoomAt(500, 250, 1e-30);
    expect(view.current.xMax - view.current.xMin).toBeCloseTo(1e6, 3);
    expect(() => new ViewportTransform(initial, 0, 100)).toThrow(RangeError);
  });
});
