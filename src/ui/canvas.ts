import type { ViewportTransform } from './viewport';

function gridStep(span: number, pixels: number): number {
  const ideal = span * 80 / pixels;
  const power = 10 ** Math.floor(Math.log10(ideal));
  const mantissa = ideal / power;
  return (mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10) * power;
}

export function renderPlane(ctx: CanvasRenderingContext2D, transform: ViewportTransform, dpr: number): void {
  const { width, height } = transform;
  const view = transform.current;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const xStep = gridStep(view.xMax - view.xMin, width);
  const yStep = gridStep(view.yMax - view.yMin, height);
  ctx.strokeStyle = '#e5eaf0';
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

  ctx.strokeStyle = '#8294a8';
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

  ctx.fillStyle = '#667789';
  ctx.font = '11px system-ui, sans-serif';
  for (let n = Math.ceil(view.xMin / xStep); n * xStep <= view.xMax; n++) {
    if (n === 0) continue;
    const x = transform.worldToScreen(n * xStep, 0).x;
    ctx.fillText(Number((n * xStep).toPrecision(4)).toString(), x + 3, Math.min(height - 5, Math.max(15, transform.worldToScreen(0, 0).y + 15)));
  }
  ctx.restore();
}
