import {drawStroke,renderPlane} from './canvas';
import {ViewportTransform} from './viewport';
import {captureStroke} from './stroke';
import type {Point} from '../core/types';
import {WorkerClient} from '../worker/client';
import {drawFittedPlot} from './plot';
import {renderFormula,type Choice} from './formulaPanel';
import {createUiState,commitStroke,undo,clear,selectCandidate,type UiState,type UiSnapshot} from './state';
import {copyToClipboard,renderCopyText} from './controls';
import {attachPanGesture} from './gestures';

export function createAppShell(root:HTMLElement):HTMLCanvasElement {
  root.innerHTML=`<main class="app-shell">
    <header class="topbar"><div class="brand"><div class="brand-mark" aria-hidden="true">∿</div>
      <div><h1>UnDraw</h1><p>Sketch a curve. Find its function.</p></div></div>
      <span class="privacy-badge" title="All fitting runs in a browser Web Worker">● All on your device</span></header>
    <div class="workspace"><div class="canvas-topline"><div class="legend"><span class="legend-ink"></span> Your stroke
      <span class="legend-fit"></span> Fitted function</div><span class="gesture-hint">Draw · Shift-drag to pan · Scroll to zoom</span></div>
      <canvas aria-label="Coordinate plane" aria-description="Draw one curve with your mouse or finger" tabindex="0"></canvas>
      <div class="toolbar" role="group" aria-label="Canvas controls">
        <button type="button" data-action="undo" title="Undo previous stroke (Ctrl+Z)">↶ Undo</button>
        <button type="button" data-action="clear" title="Clear the stroke">✕ Clear</button>
        <button type="button" data-action="reset-view" title="Reset coordinate view">⌗ Reset view</button>
      </div></div>
    <section class="result" aria-live="polite" aria-label="Function finder result">
      <div class="eyebrow">THE EXPRESSION</div>
      <div data-formula data-testid="formula" class="formula">Draw a curve on the coordinate plane</div>
      <p data-quality class="quality">The expression will appear here when you release.</p>
      <div class="choices" role="group" aria-label="Choose a candidate">
        <button type="button" data-choice="simple" aria-pressed="false">Simple</button>
        <button type="button" data-choice="balanced" aria-pressed="true">Balanced</button>
        <button type="button" data-choice="accurate" aria-pressed="false">Accurate</button>
      </div>
      <p data-plain class="plain-text"></p>
      <div class="copy-actions"><button type="button" data-action="copy-latex">Copy LaTeX</button>
        <button type="button" data-action="copy-plain">Copy expression</button></div>
    </section><footer>Hand-drawn math · No upload · No account</footer>
  </main>`;
  const canvas=root.querySelector('canvas')!;
  if(!root.isConnected)return canvas;
  const view=new ViewportTransform({xMin:-5,xMax:5,yMin:-5,yMax:5},1,1);
  const worker=new WorkerClient();
  let state:UiState=createUiState(),drawing=false,requestId=0;
  let beforeStroke:UiSnapshot={stroke:[],result:null};
  const quality=root.querySelector<HTMLElement>('[data-quality]')!;
  const formula=root.querySelector<HTMLElement>('[data-formula]')!;
  const plain=root.querySelector<HTMLElement>('[data-plain]')!;
  const draw=()=>{
    const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    const dpr=window.devicePixelRatio||1;
    view.resize(width,height);
    const targetWidth=Math.max(1,Math.round(width*dpr)),targetHeight=Math.max(1,Math.round(height*dpr));
    if(canvas.width!==targetWidth||canvas.height!==targetHeight){canvas.width=targetWidth;canvas.height=targetHeight;}
    const ctx=canvas.getContext('2d');
    if(!ctx)return;
    renderPlane(ctx,view,dpr);
    if(state.result)drawFittedPlot(ctx,state.result[state.selected],view,dpr);
    drawStroke(ctx,state.stroke,view,dpr);
  };
  const update=()=>{
    if(state.result){renderFormula(root,state.result,state.selected);plain.textContent=state.result[state.selected].plain;}
    else{
      formula.textContent=state.phase==='solving'?'Looking for the simplest explanation…':'Draw a curve on the coordinate plane';
      plain.textContent='';
      quality.textContent=state.phase==='solving'?'Analyzing your stroke on this device…':
        state.phase==='invalid'?'Try a longer, continuous curve.':'The expression will appear here when you release.';
    }
    root.querySelectorAll<HTMLButtonElement>('[data-action^="copy-"]').forEach(button=>button.disabled=!state.result);
    draw();
  };
  const cancel=()=>{worker.cancel();requestId=0;};
  const request=(points:Point[])=>{
    cancel();state=commitStroke({...state,...beforeStroke},points);update();
    requestId=worker.solve(points,view.current,{},message=>{
      if(message.id!==requestId)return;
      if(message.type==='invalid'){
        state={...state,phase:'invalid',result:null};
        update();
        quality.textContent=message.reason==='no-finite-samples'?'This curve is not single-valued as y=f(x).':'Please try a longer continuous curve.';
        formula.textContent='No function found';return;
      }
      if(message.result){state={...state,result:message.result,phase:'result'};update();}
    });
  };
  if(typeof ResizeObserver==='function')new ResizeObserver(draw).observe(canvas);
  else window.addEventListener('resize',draw);
  canvas.addEventListener('wheel',event=>{
    if(drawing)return;
    event.preventDefault();
    const rect=canvas.getBoundingClientRect();
    view.zoomAt(event.clientX-rect.left,event.clientY-rect.top,Math.exp(-event.deltaY*.001));draw();
  },{passive:false});
  attachPanGesture(canvas,view,draw);
  captureStroke(canvas,view,points=>{drawing=false;request(points);},points=>{
    if(!drawing){
      beforeStroke={stroke:state.stroke,result:state.result};
      cancel();state={...state,result:null,phase:'drawing'};
    }
    drawing=true;state={...state,stroke:points};draw();
  });
  root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button=>button.addEventListener('click',()=>{
    state=selectCandidate(state,button.dataset.choice as Choice);update();
  }));
  root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.addEventListener('click',()=>{
    cancel();state=undo(state);update();
  });
  root.querySelector<HTMLButtonElement>('[data-action="clear"]')!.addEventListener('click',()=>{
    cancel();state=clear(state);update();
  });
  root.querySelector<HTMLButtonElement>('[data-action="reset-view"]')!.addEventListener('click',()=>{
    if(!drawing){view.reset();draw();}
  });
  for(const format of ['latex','plain'] as const){
    root.querySelector<HTMLButtonElement>(`[data-action="copy-${format}"]`)!.addEventListener('click',()=>{
      void copyToClipboard(renderCopyText(state,format)).then(copied=>{
        if(copied)quality.textContent=format==='latex'?'LaTeX copied.':'Expression copied.';
      });
    });
  }
  window.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&root.isConnected){
      event.preventDefault();cancel();state=undo(state);update();
    }
  });
  update();
  return canvas;
}
