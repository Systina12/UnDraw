import {drawStroke,renderPlane} from './canvas';
import {ViewportTransform} from './viewport';
import {captureStroke} from './stroke';
import type {FitMode,SolverOptions} from '../core/types';
import {WorkerClient} from '../worker/client';
import {drawFittedPlot} from './plot';
import {renderMultiFormula,type Choice} from './formulaPanel';
import {createUiState,appendStroke,undo,clear,selectCandidate,type UiState,type UiSnapshot} from './state';
import {copyToClipboard,renderCopyText} from './controls';
import {attachPanGesture} from './gestures';

export function createAppShell(root:HTMLElement):HTMLCanvasElement {
  root.innerHTML=`<main class="app-shell">
    <header class="topbar"><div class="brand"><div class="brand-mark" aria-hidden="true">∿</div>
      <div><h1>UnDraw</h1><p>Sketch a curve. Find its function.</p></div></div>
      <span class="privacy-badge" title="All fitting runs in a browser Web Worker">● Fitting on your device</span></header>
    <div class="workspace"><div class="canvas-topline"><div class="legend"><span class="legend-ink"></span> Your stroke
      <span class="legend-fit"></span> Fitted function</div><span class="gesture-hint">Draw · Shift-drag to pan · Scroll to zoom</span>
      <span class="touch-hint">One finger draws · Two fingers move or zoom</span></div>
      <canvas aria-label="Coordinate plane" aria-description="Draw multiple curves with a mouse or one finger. Use two fingers to move or zoom." tabindex="0"></canvas>
      <div class="fit-controls">
        <fieldset class="fit-modes"><legend>How many functions?</legend>
          <label><input type="radio" name="fit-mode" value="per-stroke" checked> One per stroke</label>
          <label><input type="radio" name="fit-mode" value="auto"> Best fit · auto count</label>
        </fieldset>
        <button type="button" data-action="fit" class="fit-button" disabled>Find functions</button>
      </div>
      <details class="simplicity-settings"><summary>Prefer shorter formulas <span>optional</span></summary>
        <label class="simplicity-master"><input type="checkbox" data-simplify="enabled"> Allow a little error for fewer digits</label>
        <fieldset data-simplicity-options disabled><legend>Allowed changes to the fitted curve</legend>
          <label><input type="checkbox" data-simplify="translation" checked> Shift</label>
          <label><input type="checkbox" data-simplify="scaling" checked> Scale</label>
          <label><input type="checkbox" data-simplify="deformation"> Reshape</label>
          <label class="simplicity-tolerance">Limit
            <select data-simplify="tolerance" aria-label="Allowed deviation">
              <option value="0.02">Subtle · 2%</option><option value="0.05" selected>Moderate · 5%</option>
              <option value="0.10">Loose · 10%</option>
            </select>
          </label>
        </fieldset>
        <p>RMS change relative to half the drawn height (or half the bounding-box diagonal for a parametric curve). Accurate keeps the original fit.</p>
      </details>
      <div class="toolbar" role="group" aria-label="Canvas controls">
        <button type="button" data-action="undo" title="Undo previous stroke (Ctrl+Z)">↶ Undo</button>
        <button type="button" data-action="clear" title="Clear the stroke">✕ Clear</button>
        <button type="button" data-action="reset-view" title="Reset coordinate view">⌗ Reset view</button>
      </div></div>
    <section class="result" aria-live="polite" aria-label="Function finder result">
      <div class="eyebrow">THE EXPRESSION</div>
      <div data-formula data-testid="formula" class="formula">Draw one or more strokes</div>
      <p data-quality class="quality">Click Find functions when your drawing is ready.</p>
      <div class="choices" role="group" aria-label="Choose a candidate">
        <button type="button" data-choice="simple" aria-pressed="false">Simple</button>
        <button type="button" data-choice="balanced" aria-pressed="true">Balanced</button>
        <button type="button" data-choice="accurate" aria-pressed="false">Accurate</button>
      </div>
      <p data-plain class="plain-text"></p>
      <div class="copy-actions"><button type="button" data-action="copy-latex">Copy LaTeX</button>
        <button type="button" data-action="copy-plain">Copy expression</button></div>
    </section><footer>Hand-drawn math · Sketches stay on your device · Page analytics · No account</footer>
  </main>`;
  const canvas=root.querySelector('canvas')!;
  if(!root.isConnected)return canvas;
  const view=new ViewportTransform({xMin:-5,xMax:5,yMin:-5,yMax:5},1,1);
  const worker=new WorkerClient();
  let state:UiState=createUiState(),drawing=false,requestId=0;
  let beforeStroke:UiSnapshot={strokes:[],result:null};
  let beforePhase:UiState['phase']='idle';
  let touchOrigin:{id:number;x:number;y:number}|null=null;
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
    const colors=['#236aa5','#137f79','#8152aa','#b46920','#2772ac'];
    state.strokes.forEach(stroke=>drawStroke(ctx,stroke,view,dpr));
    drawStroke(ctx,state.draft,view,dpr);
    state.result?.groups.forEach((group,i)=>{
      const support=group.result.mode==='function'?group.strokeIndices.flatMap(index=>{
        const stroke=state.strokes[index];
        if(!stroke?.length)return [];
        let min=Infinity,max=-Infinity;
        for(const point of stroke){min=Math.min(min,point.x);max=Math.max(max,point.x);}
        return [[min,max] as const];
      }):undefined;
      drawFittedPlot(ctx,group.result[state.selected],view,dpr,colors[i%colors.length],support);
    });
  };
  const update=()=>{
    if(state.result){
      renderMultiFormula(root,state.result,state.selected);
      plain.textContent=state.result.groups.map((group,i)=>
        `${state.result!.groups.length===1?'y':`y${i+1}`} = ${group.result[state.selected].plain}`).join('  ·  ');
    }
    else{
      formula.textContent=state.phase==='solving'?'Looking for the simplest explanation…':
        state.phase==='invalid'?'No function found':state.strokes.length?
          `${state.strokes.length} stroke${state.strokes.length===1?'':'s'} ready`:'Draw one or more strokes';
      plain.textContent='';
      quality.textContent=state.phase==='solving'?'Analyzing your strokes on this device…':
        state.phase==='invalid'?'Try longer, continuous strokes.':'Click Find functions when your drawing is ready.';
    }
    root.querySelectorAll<HTMLButtonElement>('[data-action^="copy-"]').forEach(button=>button.disabled=!state.result);
    root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.disabled=!state.strokes.length||drawing;
    draw();
  };
  const cancel=()=>{worker.cancel();requestId=0;};
  const simplicityOptions=():SolverOptions['simplify']=>{
    const checked=(name:string)=>root.querySelector<HTMLInputElement>(`[data-simplify="${name}"]`)!.checked;
    return {enabled:checked('enabled'),translation:checked('translation'),scaling:checked('scaling'),
      deformation:checked('deformation'),
      tolerance:Number(root.querySelector<HTMLSelectElement>('[data-simplify="tolerance"]')!.value)};
  };
  const request=()=>{
    if(!state.strokes.length||drawing)return;
    cancel();state={...state,result:null,phase:'solving'};update();
    requestId=worker.solveStrokes(state.strokes,state.mode,view.current,{simplify:simplicityOptions()},message=>{
      if(message.id!==requestId)return;
      if(drawing){
        if(message.type==='batch-progress'||message.type==='batch-done'){
          beforeStroke={...beforeStroke,result:message.result};beforePhase='result';
        }
        if(message.type==='invalid')beforePhase='invalid';
        return;
      }
      if(message.type==='invalid'){
        state={...state,phase:'invalid',result:null};
        update();
        quality.textContent='Please draw at least one longer, continuous stroke.';
        return;
      }
      if(message.type==='batch-progress'||message.type==='batch-done'){
        state={...state,result:message.result,phase:'result'};update();
      }
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
  captureStroke(canvas,view,points=>{
    drawing=false;touchOrigin=null;cancel();
    state=appendStroke({...state,...beforeStroke},points);update();
  },(points,source)=>{
    const starting=!drawing;
    if(starting){
      beforeStroke={strokes:state.strokes,result:state.result};
      beforePhase=state.phase;
      if(source.pointerType==='touch')touchOrigin={id:source.pointerId,x:source.clientX,y:source.clientY};
      else {touchOrigin=null;cancel();}
      state={...state,result:null,phase:'drawing'};
    }
    if(touchOrigin?.id===source.pointerId &&
      Math.hypot(source.clientX-touchOrigin.x,source.clientY-touchOrigin.y)>8){
      cancel();touchOrigin=null;
    }
    drawing=true;state={...state,draft:points};if(starting)update();else draw();
  },()=>{
    drawing=false;touchOrigin=null;
    state={...state,draft:[],strokes:beforeStroke.strokes,result:beforeStroke.result,
      phase:beforeStroke.result?'result':beforePhase==='solving'&&requestId?'solving':
        beforePhase==='invalid'?'invalid':'idle'};
    update();
  });
  attachPanGesture(canvas,view,draw);
  root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.addEventListener('click',request);
  root.querySelectorAll<HTMLInputElement>('input[name="fit-mode"]').forEach(input=>input.addEventListener('change',()=>{
    if(!input.checked)return;
    cancel();state={...state,mode:input.value as FitMode,result:null,phase:'idle'};update();
  }));
  root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-simplify]').forEach(input=>input.addEventListener('change',()=>{
    root.querySelector<HTMLFieldSetElement>('[data-simplicity-options]')!.disabled=
      !root.querySelector<HTMLInputElement>('[data-simplify="enabled"]')!.checked;
    cancel();state={...state,result:null,phase:'idle',selected:'balanced'};update();
  }));
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
