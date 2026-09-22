import type { CandidateResult, Point, SolveResult, Viewport } from "../core/types";
import { panViewport, screenToWorld, worldToScreen, DEFAULT_VIEWPORT, zoomViewport } from "./viewport";

export type StrokeHandler = (points: Point[]) => void;
export type StrokeStartHandler = () => void;
export type StrokeCancelHandler = () => void;

export class CoordinateCanvas {
  private viewport: Viewport = { ...DEFAULT_VIEWPORT };
  private rawPoints: Point[] = [];
  private selected: CandidateResult | null = null;
  private parametricCurve: { x: number[]; y: number[] } | null = null;
  private drawing = false;
  private panning = false;
  private pointerId: number | null = null;
  private lastScreen = { x: 0, y: 0 };

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onStroke: StrokeHandler,
    private readonly onStrokeStart?: StrokeStartHandler,
    private readonly onStrokeCancel?: StrokeCancelHandler,
  ) {
    this.resize();
    window.addEventListener("resize", () => this.resize());
    canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
    canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
    canvas.addEventListener("pointerup", (event) => this.pointerUp(event));
    canvas.addEventListener("pointercancel", (event) => this.pointerCancel(event));
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      this.viewport = zoomViewport(this.viewport, event.deltaY < 0 ? 1.12 : 1 / 1.12, anchor);
      this.draw();
    }, { passive: false });
    this.draw();
  }

  public getViewport(): Viewport {
    return { ...this.viewport };
  }

  public setResult(result: SolveResult | null, candidate?: CandidateResult): void {
    this.parametricCurve = null;
    this.selected = candidate ?? result?.balanced ?? null;
    this.draw();
  }

  public setParametricCurve(curve: { x: readonly number[]; y: readonly number[] }): void {
    this.selected = null;
    this.parametricCurve = { x: [...curve.x], y: [...curve.y] };
    this.draw();
  }

  public clear(): void {
    this.rawPoints = [];
    this.selected = null;
    this.parametricCurve = null;
    this.draw();
  }

  public undo(): void {
    this.rawPoints = [];
    this.selected = null;
    this.parametricCurve = null;
    this.draw();
  }

  public resetView(): void {
    this.viewport = { ...DEFAULT_VIEWPORT, width: this.viewport.width, height: this.viewport.height };
    this.draw();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.viewport.width = Math.max(1, rect.width);
    this.viewport.height = Math.max(1, rect.height);
    this.draw();
  }

  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1) return;
    const rect = this.canvas.getBoundingClientRect();
    this.lastScreen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.pointerId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.panning = event.button === 1 || event.altKey || event.shiftKey;
    this.drawing = !this.panning;
    if (this.drawing) {
      this.onStrokeStart?.();
      const world = screenToWorld(this.lastScreen, this.viewport);
      this.rawPoints = [{ ...world, t: performance.now() }];
      this.selected = null;
      this.parametricCurve = null;
      this.draw();
    }
  }

  private pointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    const rect = this.canvas.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (this.panning) {
      this.viewport = panViewport(this.viewport, screen.x - this.lastScreen.x, screen.y - this.lastScreen.y);
      this.lastScreen = screen;
      this.draw();
      return;
    }
    if (!this.drawing) return;
    const world = screenToWorld(screen, this.viewport);
    const previous = this.rawPoints.at(-1);
    if (!previous || Math.hypot(world.x - previous.x, world.y - previous.y) > 0.004) this.rawPoints.push({ ...world, t: performance.now() });
    this.lastScreen = screen;
    this.draw();
  }

  private pointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    if (this.drawing) this.onStroke([...this.rawPoints]);
    this.finishPointer(event.pointerId);
  }

  private pointerCancel(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    this.finishPointer(event.pointerId);
    this.onStrokeCancel?.();
  }

  private finishPointer(pointerId: number): void {
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    this.drawing = false;
    this.panning = false;
    this.pointerId = null;
  }

  private draw(): void {
    const context = this.canvas.getContext("2d");
    if (!context) return;
    const dpr = window.devicePixelRatio || 1;
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, this.viewport.width, this.viewport.height);
    context.fillStyle = "#fbfcff";
    context.fillRect(0, 0, this.viewport.width, this.viewport.height);
    this.drawGrid(context);
    this.drawCurve(context, this.parametricCurve?.x ?? this.selected?.plot.x, this.parametricCurve?.y ?? this.selected?.plot.y, "#7c3aed", 2.6);
    this.drawCurve(context, this.rawPoints.map((point) => point.x), this.rawPoints.map((point) => point.y), "#172033", 2.2);
    context.restore();
  }

  private drawGrid(context: CanvasRenderingContext2D): void {
    const xStep = niceStep((this.viewport.xmax - this.viewport.xmin) / 10);
    const yStep = niceStep((this.viewport.ymax - this.viewport.ymin) / 8);
    context.lineWidth = 1;
    context.strokeStyle = "#e5e9f2";
    context.fillStyle = "#8b95a7";
    context.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    for (let value = Math.ceil(this.viewport.xmin / xStep) * xStep; value <= this.viewport.xmax; value += xStep) {
      const screen = worldToScreen({ x: value, y: 0 }, this.viewport);
      context.beginPath(); context.moveTo(screen.x, 0); context.lineTo(screen.x, this.viewport.height); context.stroke();
      if (Math.abs(value) > xStep / 10) context.fillText(formatTick(value), screen.x + 4, Math.min(this.viewport.height - 6, Math.max(14, worldToScreen({ x: 0, y: 0 }, this.viewport).y + 16)));
    }
    for (let value = Math.ceil(this.viewport.ymin / yStep) * yStep; value <= this.viewport.ymax; value += yStep) {
      const screen = worldToScreen({ x: 0, y: value }, this.viewport);
      context.beginPath(); context.moveTo(0, screen.y); context.lineTo(this.viewport.width, screen.y); context.stroke();
      if (Math.abs(value) > yStep / 10) context.fillText(formatTick(value), Math.min(this.viewport.width - 32, Math.max(4, worldToScreen({ x: 0, y: 0 }, this.viewport).x + 8)), screen.y - 5);
    }
    const origin = worldToScreen({ x: 0, y: 0 }, this.viewport);
    context.strokeStyle = "#9aa5b7";
    context.lineWidth = 1.5;
    context.beginPath(); context.moveTo(0, origin.y); context.lineTo(this.viewport.width, origin.y); context.stroke();
    context.beginPath(); context.moveTo(origin.x, 0); context.lineTo(origin.x, this.viewport.height); context.stroke();
  }

  private drawCurve(context: CanvasRenderingContext2D, xs: number[] | undefined, ys: number[] | undefined, color: string, width: number): void {
    if (!xs || !ys || xs.length === 0) return;
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    let drawing = false;
    xs.forEach((x, index) => {
      const y = ys[index];
      if (y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) { drawing = false; return; }
      const screen = worldToScreen({ x, y }, this.viewport);
      if (!drawing) { context.moveTo(screen.x, screen.y); drawing = true; } else context.lineTo(screen.x, screen.y);
    });
    context.stroke();
  }
}

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const normalized = raw / power;
  const multiplier = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return multiplier * power;
}

function formatTick(value: number): string {
  return Number(value.toPrecision(3)).toString();
}
