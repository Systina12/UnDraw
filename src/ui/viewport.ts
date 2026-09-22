import type { Viewport } from '../core/types';

const DEFAULT_VIEW: Viewport = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
const MIN_SPAN = 1e-3;
const MAX_SPAN = 1e6;

export class ViewportTransform {
  private view: Viewport;
  width: number;
  height: number;

  constructor(view: Viewport = DEFAULT_VIEW, width: number, height: number) {
    this.checkSize(width, height);
    this.checkView(view);
    this.view = { ...view };
    this.width = width;
    this.height = height;
  }

  get current(): Viewport { return { ...this.view }; }

  resize(width: number, height: number): void {
    this.checkSize(width, height);
    this.width = width;
    this.height = height;
  }

  screenToWorld(px: number, py: number): { x: number; y: number } {
    return {
      x: this.view.xMin + px / this.width * (this.view.xMax - this.view.xMin),
      y: this.view.yMax - py / this.height * (this.view.yMax - this.view.yMin),
    };
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - this.view.xMin) / (this.view.xMax - this.view.xMin) * this.width,
      y: (this.view.yMax - y) / (this.view.yMax - this.view.yMin) * this.height,
    };
  }

  zoomAt(px: number, py: number, factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const anchor = this.screenToWorld(px, py);
    const xSpan = Math.min(MAX_SPAN, Math.max(MIN_SPAN, (this.view.xMax - this.view.xMin) / factor));
    const ySpan = Math.min(MAX_SPAN, Math.max(MIN_SPAN, (this.view.yMax - this.view.yMin) / factor));
    const xMin = anchor.x - px / this.width * xSpan;
    const yMax = anchor.y + py / this.height * ySpan;
    this.view = { xMin, xMax: xMin + xSpan, yMin: yMax - ySpan, yMax };
  }

  pan(dxPx: number, dyPx: number): void {
    if (!Number.isFinite(dxPx) || !Number.isFinite(dyPx)) return;
    const dx = dxPx / this.width * (this.view.xMax - this.view.xMin);
    const dy = dyPx / this.height * (this.view.yMax - this.view.yMin);
    this.view = {
      xMin: this.view.xMin - dx,
      xMax: this.view.xMax - dx,
      yMin: this.view.yMin + dy,
      yMax: this.view.yMax + dy,
    };
  }

  reset(): void { this.view = { ...DEFAULT_VIEW }; }

  private checkSize(width: number, height: number): void {
    if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new RangeError('Canvas size must be finite and positive');
    }
  }

  private checkView(view: Viewport): void {
    if (!Object.values(view).every(Number.isFinite) || view.xMin >= view.xMax || view.yMin >= view.yMax) {
      throw new RangeError('Viewport bounds must be finite and increasing');
    }
  }
}
