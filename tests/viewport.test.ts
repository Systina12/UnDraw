import { describe, expect, it } from "vitest";
import { DEFAULT_VIEWPORT, screenToWorld, worldToScreen, zoomViewport } from "../src/ui/viewport";

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
});
