import { renderPlane } from './canvas';
import { ViewportTransform } from './viewport';

export function createAppShell(root: HTMLElement): HTMLCanvasElement {
  root.innerHTML = `<main class="app-shell">
    <header><h1>UnDraw</h1><p>Draw a curve</p></header>
    <canvas aria-label="Coordinate plane"></canvas>
  </main>`;
  const canvas = root.querySelector('canvas')!;
  if (root.isConnected) {
    const view = new ViewportTransform({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 }, 1, 1);
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = window.devicePixelRatio || 1;
      view.resize(width, height);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const ctx = canvas.getContext('2d');
      if (ctx) renderPlane(ctx, view, dpr);
    };
    if (typeof ResizeObserver === 'function') new ResizeObserver(draw).observe(canvas);
    else window.addEventListener('resize', draw);
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      view.zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * .001));
      draw();
    }, { passive: false });
    draw();
  }
  return canvas;
}
