import type { ViewportTransform } from './viewport';
import type { Point } from '../core/types';

export function drawStroke(ctx: CanvasRenderingContext2D, points: readonly Point[],
  transform: ViewportTransform, dpr: number, color = '#d4574b'): void {
  if (!points.length) return;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((point, i) => {
    const { x, y } = transform.worldToScreen(point.x, point.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

function gridStep(span: number, pixels: number): number {
  const ideal = span * 80 / pixels;
  const power = 10 ** Math.floor(Math.log10(ideal));
  const mantissa = ideal / power;
  return (mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10) * power;
}

export interface PlaneColors { grid: string; axis: string; label: string }

export function renderPlane(ctx: CanvasRenderingContext2D, transform: ViewportTransform, dpr: number,
  colors: PlaneColors = {grid:'#e5edf5',axis:'#91a4b8',label:'#61768c'}): void {
  const { width, height } = transform;
  const view = transform.current;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const xStep = gridStep(view.xMax - view.xMin, width);
  const yStep = gridStep(view.yMax - view.yMin, height);
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let n = Math.ceil(view.xMin / xStep); n * xStep <= view.xMax; n++) {
    const x = transform.worldToScreen(n * xStep, 0).x;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let n = Math.ceil(view.yMin / yStep); n * yStep <= view.yMax; n++) {
    const y = transform.worldToScreen(0, n * yStep).y;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (view.xMin <= 0 && view.xMax >= 0) {
    const x = transform.worldToScreen(0, 0).x;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  if (view.yMin <= 0 && view.yMax >= 0) {
    const y = transform.worldToScreen(0, 0).y;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  ctx.fillStyle = colors.label;
  ctx.font = '11px system-ui, sans-serif';
  for (let n = Math.ceil(view.xMin / xStep); n * xStep <= view.xMax; n++) {
    if (n === 0) continue;
    const x = transform.worldToScreen(n * xStep, 0).x;
    ctx.fillText(Number((n * xStep).toPrecision(4)).toString(), x + 3, Math.min(height - 5, Math.max(15, transform.worldToScreen(0, 0).y + 15)));
  }
  const labelX=Math.min(width-35,Math.max(4,transform.worldToScreen(0,0).x+5));
  for(let n=Math.ceil(view.yMin/yStep);n*yStep<=view.yMax;n++){
    if(n===0)continue;
    const y=transform.worldToScreen(0,n*yStep).y;
    if(y<12||y>height-5)continue;
    ctx.fillText(Number((n*yStep).toPrecision(4)).toString(),labelX,y-3);
  }
  ctx.restore();
}
