import { describe, expect, it } from "vitest";
import { DEFAULT_VIEWPORT, MAX_WORLD_SPAN, MIN_WORLD_SPAN, screenToWorld, worldToScreen, zoomViewport } from "../src/ui/viewport";

describe("mathematical viewport", () => {
  it("maps the canvas center to world origin and inverts the transform", () => {
    const viewport = { ...DEFAULT_VIEWPORT, width: 1000, height: 800 };
    const world = screenToWorld({ x: 500, y: 400 }, viewport);
    expect(world.x).toBeCloseTo(0);
    expect(world.y).toBeCloseTo(0);
    expect(worldToScreen(world, viewport)).toEqual({ x: 500, y: 400 });
  });

  it("zooms around the pointer without moving its world coordinate", () => {
    const viewport = { ...DEFAULT_VIEWPORT, width: 1000, height: 800 };
    const anchor = { x: 730, y: 180 };
    const before = screenToWorld(anchor, viewport);
    const after = zoomViewport(viewport, 2, anchor);
    expect(screenToWorld(anchor, after)).toEqual(before);
  });

  it("keeps repeated zooming inside numerically safe world spans", () => {
    const viewport = { ...DEFAULT_VIEWPORT, width: 1000, height: 800 };
    const anchor = { x: 730, y: 180 };
    let zoomedIn = viewport;
    for (let index = 0; index < 500; index += 1) zoomedIn = zoomViewport(zoomedIn, 8, anchor);
    expect(zoomedIn.xmax - zoomedIn.xmin).toBeGreaterThanOrEqual(MIN_WORLD_SPAN * 0.999);
    expect(zoomedIn.ymax - zoomedIn.ymin).toBeGreaterThanOrEqual(MIN_WORLD_SPAN * 0.999);

    let zoomedOut = viewport;
    for (let index = 0; index < 500; index += 1) zoomedOut = zoomViewport(zoomedOut, 0.125, anchor);
    expect(zoomedOut.xmax - zoomedOut.xmin).toBeLessThanOrEqual(MAX_WORLD_SPAN);
    expect(zoomedOut.ymax - zoomedOut.ymin).toBeLessThanOrEqual(MAX_WORLD_SPAN);
  });
});
