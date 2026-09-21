import type { Viewport, XY } from "../core/types";

export const DEFAULT_VIEWPORT: Viewport = {
  xmin: -5,
  xmax: 5,
  ymin: -5,
  ymax: 5,
  width: 800,
  height: 600,
};

export function screenToWorld(point: XY, viewport: Viewport): XY {
  return {
    x: viewport.xmin + (point.x / viewport.width) * (viewport.xmax - viewport.xmin),
    y: viewport.ymax - (point.y / viewport.height) * (viewport.ymax - viewport.ymin),
  };
}

export function worldToScreen(point: XY, viewport: Viewport): XY {
  return {
    x: ((point.x - viewport.xmin) / (viewport.xmax - viewport.xmin)) * viewport.width,
    y: ((viewport.ymax - point.y) / (viewport.ymax - viewport.ymin)) * viewport.height,
  };
}

export function panViewport(viewport: Viewport, dxPixels: number, dyPixels: number): Viewport {
  const xScale = (viewport.xmax - viewport.xmin) / viewport.width;
  const yScale = (viewport.ymax - viewport.ymin) / viewport.height;
  return {
    ...viewport,
    xmin: viewport.xmin - dxPixels * xScale,
    xmax: viewport.xmax - dxPixels * xScale,
    ymin: viewport.ymin + dyPixels * yScale,
    ymax: viewport.ymax + dyPixels * yScale,
  };
}

export function zoomViewport(viewport: Viewport, factor: number, anchor: XY): Viewport {
  const safeFactor = Math.min(8, Math.max(0.125, factor));
  const anchorWorld = screenToWorld(anchor, viewport);
  const width = (viewport.xmax - viewport.xmin) / safeFactor;
  const height = (viewport.ymax - viewport.ymin) / safeFactor;
  const xRatio = anchor.x / viewport.width;
  const yRatio = anchor.y / viewport.height;
  return {
    ...viewport,
    xmin: anchorWorld.x - xRatio * width,
    xmax: anchorWorld.x + (1 - xRatio) * width,
    ymin: anchorWorld.y - (1 - yRatio) * height,
    ymax: anchorWorld.y + yRatio * height,
  };
}
