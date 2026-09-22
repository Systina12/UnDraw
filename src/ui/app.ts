import { drawStroke, renderPlane } from './canvas';
import { ViewportTransform } from './viewport';
import { captureStroke } from './stroke';
import type { Point } from '../core/types';
import type { SolveResult } from '../core/types';
import {WorkerClient} from '../worker/client';
import {drawFittedPlot} from './plot';
import {renderFormula,type Choice} from './formulaPanel';

export function createAppShell(root: HTMLElement): HTMLCanvasElement {
  root.innerHTML = `<main class="app-shell">
    <header><h1>UnDraw</h1><p>Draw a curve</p></header>
    <canvas aria-label="Coordinate plane"></canvas>
    <section class="result" aria-live="polite"><div data-formula>Draw a single curve to find its function.</div>
      <p data-quality></p><div class="choices" role="group" aria-label="Candidate complexity">
      <button type="button" data-choice="simple" aria-pressed="false">Simple</button>
      <button type="button" data-choice="balanced" aria-pressed="true">Balanced</button>
      <button type="button" data-choice="accurate" aria-pressed="false">Accurate</button></div></section>
  </main>`;
  const canvas = root.querySelector('canvas')!;
  if (root.isConnected) {
    const view = new ViewportTransform({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 }, 1, 1);
    let stroke: Point[] = [];
    let drawing = false;
    let result:SolveResult|null=null;
    let choice:Choice='balanced';
    const worker=new WorkerClient();
    let requestId=0;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = window.devicePixelRatio || 1;
      view.resize(width, height);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        renderPlane(ctx, view, dpr);
        if(result)drawFittedPlot(ctx,result[choice],view,dpr);
        drawStroke(ctx, stroke, view, dpr);
      }
    };
    if (typeof ResizeObserver === 'function') new ResizeObserver(draw).observe(canvas);
    else window.addEventListener('resize', draw);
    canvas.addEventListener('wheel', event => {
      if (drawing) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      view.zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * .001));
      draw();
    }, { passive: false });
    root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button=>button.addEventListener('click',()=>{
      choice=button.dataset.choice as Choice;
      if(result){renderFormula(root,result,choice);draw();}
    }));
    captureStroke(canvas, view,
      points => {
        stroke=points;drawing=false;draw();
        const quality=root.querySelector<HTMLElement>('[data-quality]');
        if(quality)quality.textContent='Finding a function…';
        requestId=worker.solve(points,view.current,{},message=>{
          if(message.id!==requestId)return;
          if(message.type==='invalid'){
            if(quality)quality.textContent=message.reason==='no-finite-samples'?'This curve is not single-valued as y=f(x).':'Draw a longer curve to try again.';
            return;
          }
          if(message.result){result=message.result;renderFormula(root,result,choice);draw();}
        });
      },
      points => {
        if(!drawing){worker.cancel();result=null;}
        stroke=points;drawing=true;draw();
      });
    draw();
  }
  return canvas;
}
