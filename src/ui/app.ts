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
import {loadImage,closeImage,paintImage,contourToStroke,nearestContour,matchSelectedContours,ImageEdgeClient,
  type ImageReference} from './image';
import type {EdgeDetail} from '../image/edges';

export function createAppShell(root:HTMLElement):HTMLCanvasElement {
  root.innerHTML=`<main class="app-shell">
    <header class="topbar"><div class="brand"><div class="brand-mark" aria-hidden="true">∿</div>
      <div><h1>UnDraw</h1><p>Sketch a curve. Find its function.</p></div></div>
      <span class="privacy-badge" title="All fitting runs in a browser Web Worker">● Fitting on your device</span></header>
    <div class="workspace"><div class="canvas-topline"><div class="legend"><span class="legend-ink"></span> Your stroke
      <span class="legend-fit"></span> Fitted function</div><span class="gesture-hint">Draw · Shift-drag to pan · Scroll to zoom</span>
      <span class="touch-hint">One finger draws · Two fingers move or zoom</span></div>
      <canvas aria-label="Coordinate plane" aria-description="Draw multiple curves with a mouse or one finger. Use two fingers to move or zoom." tabindex="0"></canvas>
      <div class="canvas-bottom"><div class="image-controls">
        <label class="upload-button">↑ Upload image<input type="file" data-image-file
          accept="image/png,image/jpeg,image/webp,image/bmp" aria-label="Upload image"></label>
        <span data-image-status role="status">Import an image to detect its edges on this device.</span>
        <label data-image-detail hidden>Edge detail <select aria-label="Edge detail"><option value="low">Low</option>
          <option value="normal" selected>Normal</option><option value="high">High</option></select></label>
        <button type="button" data-action="image-tool" hidden>Draw by hand</button>
        <button type="button" data-action="remove-image" hidden>Remove image</button>
      </div><div class="toolbar" role="group" aria-label="Canvas controls">
        <button type="button" data-action="undo" title="Undo previous stroke (Ctrl+Z)">↶ Undo</button>
        <button type="button" data-action="clear" title="Clear the stroke">✕ Clear</button>
        <button type="button" data-action="reset-view" title="Reset coordinate view">⌗ Reset view</button>
      </div></div>
      <div class="fit-controls">
        <fieldset class="fit-modes"><legend>How many functions?</legend>
          <div class="mode-options"><label><input type="radio" name="fit-mode" value="per-stroke" checked> One per stroke</label>
          <label><input type="radio" name="fit-mode" value="auto"> Best fit · auto count</label></div>
        </fieldset>
        <button type="button" data-action="fit" class="fit-button" disabled>Find functions</button>
      </div>
      <details class="simplicity-settings"><summary>Prefer shorter formulas <span>5% by default</span></summary>
        <label class="simplicity-master"><input type="checkbox" data-simplify="enabled" checked> Allow a little error for fewer digits</label>
        <fieldset data-simplicity-options><legend>Allowed changes to the fitted curve</legend>
          <label><input type="checkbox" data-simplify="translation" checked> Shift</label>
          <label><input type="checkbox" data-simplify="scaling" checked> Scale</label>
          <label><input type="checkbox" data-simplify="deformation" checked> Reshape</label>
          <label><input type="checkbox" data-simplify="coefficients" checked> Round low-impact coefficients</label>
          <label class="simplicity-tolerance">Limit
            <select data-simplify="tolerance" aria-label="Allowed deviation">
              <option value="0.02">Subtle · 2%</option><option value="0.05" selected>Moderate · 5%</option>
              <option value="0.10">Loose · 10%</option>
            </select>
          </label>
        </fieldset>
        <p>Coefficient rounding can use up to one quarter of the selected limit for each disabled change type. Shift, Scale and Reshape permit larger changes. Accurate keeps the original fit. Limit measures RMS change against half the drawn height (or parametric half-diagonal).</p>
      </details>
      </div>
    <section class="result" aria-live="polite" aria-label="Function finder result">
      <div class="result-header"><div class="eyebrow">THE EXPRESSION</div><div class="choices" role="group" aria-label="Choose a candidate">
        <button type="button" data-choice="simple" aria-pressed="false">Simple</button>
        <button type="button" data-choice="balanced" aria-pressed="false">Balanced</button>
        <button type="button" data-choice="accurate" aria-pressed="true">Accurate</button>
      </div></div>
      <div data-formula data-testid="formula" class="formula">Draw one or more strokes</div>
      <p data-quality class="quality">Click Find functions when your drawing is ready.</p>
      <p data-plain class="plain-text"></p>
      <div class="copy-actions"><button type="button" data-action="copy-latex">Copy LaTeX</button>
        <button type="button" data-action="copy-plain">Copy expression</button></div>
    </section><footer>Hand-drawn math · Sketches stay on your device · Page analytics · No account</footer>
  </main>`;
  const canvas=root.querySelector('canvas')!;
  if(!root.isConnected)return canvas;
  const view=new ViewportTransform({xMin:-5,xMax:5,yMin:-5,yMax:5},1,1);
  const worker=new WorkerClient();
  const edgeWorker=new ImageEdgeClient();
  let state:UiState=createUiState(),drawing=false,requestId=0;
  let image:ImageReference|null=null,imageVersion=0,selectEdges=false;
  const imported=new Map<number,typeof state.strokes[number]>();
  const selectedContours=()=>new Set([...imported].filter(([,stroke])=>state.strokes.includes(stroke))
    .map(([index])=>index));
  const imageStatus=root.querySelector<HTMLElement>('[data-image-status]')!;
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
    const palette=getComputedStyle(root);
    const token=(name:string,fallback:string)=>palette.getPropertyValue(name).trim()||fallback;
    renderPlane(ctx,view,dpr,{grid:token('--grid-color','#e5edf5'),
      axis:token('--axis-color','#91a4b8'),label:token('--grid-label','#61768c')});
    if(image)paintImage(ctx,image,view,dpr,selectedContours());
    const color=(index:number)=>token(`--fit-${index%5}`,'#075cd5');
    const halo=token('--fit-halo','#fff');
    const strokeColor=token('--stroke-ink','#d4574b');
    state.strokes.forEach(stroke=>drawStroke(ctx,stroke,view,dpr,strokeColor));
    drawStroke(ctx,state.draft,view,dpr,strokeColor);
    state.result?.groups.forEach((group,i)=>{
      const support=group.result.mode==='function'?group.strokeIndices.flatMap(index=>{
        const stroke=state.strokes[index];
        if(!stroke?.length)return [];
        let min=Infinity,max=-Infinity;
        for(const point of stroke){min=Math.min(min,point.x);max=Math.max(max,point.x);}
        return [[min,max] as const];
      }):undefined;
      drawFittedPlot(ctx,group.result[state.selected],view,dpr,color(i),support,halo);
    });
  };
  const update=()=>{
    if(state.result){
      renderMultiFormula(root,state.result,state.selected);
      if(state.phase==='solving'){
        const seen=new Set(state.result.groups.flatMap(group=>group.strokeIndices));
        quality.textContent+=` · Finding more · ${seen.size}/${state.strokes.length} strokes analyzed`;
      }
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
    root.querySelector<HTMLElement>('.result')!.setAttribute('aria-busy',String(state.phase==='solving'));
    root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.disabled=!state.strokes.length||drawing;
    draw();
  };
  const cancel=()=>{worker.cancel();requestId=0;};
  const refreshImageControls=()=>{
    root.querySelector<HTMLElement>('[data-image-detail]')!.hidden=!image;
    const tool=root.querySelector<HTMLButtonElement>('[data-action="image-tool"]')!;
    tool.hidden=!image;tool.textContent=selectEdges?'Draw by hand':'Select image edges';
    root.querySelector<HTMLButtonElement>('[data-action="remove-image"]')!.hidden=!image;
    canvas.classList.toggle('select-edges',selectEdges);
  };
  const detect=async(detail:EdgeDetail)=>{
    if(!image)return;
    const version=++imageVersion,reference=image;
    imageStatus.textContent='Detecting image edges on this device…';
    try{
      const contours=await edgeWorker.detect(reference,detail);
      if(version!==imageVersion||image!==reference)return;
      const previousSelected=[...imported.values()].filter(stroke=>state.strokes.includes(stroke));
      reference.contours=contours;imported.clear();
      for(const [index,stroke] of matchSelectedContours(reference,previousSelected))imported.set(index,stroke);
      draw();
      const size=`${reference.bounds.xMax} × ${reference.bounds.yMax} px · (0, 0) bottom left`;
      imageStatus.textContent=contours.length?
        `${size} · ${contours.length} edges detected · Tap a highlighted edge to add it as a stroke.`:
        `${size} · No clear edges found. Try High detail or draw over the image.`;
    }catch(error){
      if(version!==imageVersion)return;
      imageStatus.textContent=error instanceof Error?error.message:'Edge detection failed.';
    }
  };
  const removeImage=()=>{
    imageVersion++;edgeWorker.cancel();if(image)closeImage(image);image=null;selectEdges=false;
    imported.clear();refreshImageControls();
    imageStatus.textContent='Import an image to detect its edges on this device.';
  };
  const simplicityOptions=():SolverOptions['simplify']=>{
    const checked=(name:string)=>root.querySelector<HTMLInputElement>(`[data-simplify="${name}"]`)!.checked;
    return {enabled:checked('enabled'),translation:checked('translation'),scaling:checked('scaling'),
      deformation:checked('deformation'),coefficients:checked('coefficients'),
      tolerance:Number(root.querySelector<HTMLSelectElement>('[data-simplify="tolerance"]')!.value)};
  };
  const request=()=>{
    if(!state.strokes.length||drawing)return;
    cancel();state={...state,result:null,phase:'solving'};update();
    requestId=worker.solveStrokes(state.strokes,state.mode,view.current,{simplify:simplicityOptions()},message=>{
      if(message.id!==requestId)return;
      if(drawing){
        if(message.type==='batch-progress'||message.type==='batch-done'){
          beforeStroke={...beforeStroke,result:message.result};
          beforePhase=message.type==='batch-done'?'result':'solving';
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
        state={...state,result:message.result,
          phase:message.type==='batch-done'?'result':'solving'};update();
      }
    });
  };
  if(typeof ResizeObserver==='function')new ResizeObserver(draw).observe(canvas);
  else window.addEventListener('resize',draw);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',draw);
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
      phase:beforePhase==='solving'&&requestId?'solving':beforeStroke.result?'result':
        beforePhase==='invalid'?'invalid':'idle'};
    update();
  },()=>!selectEdges);
  attachPanGesture(canvas,view,draw);
  const selectPointers=new Map<number,{x:number;y:number;moved:boolean}>();
  canvas.addEventListener('pointerdown',event=>{
    if(!selectEdges||event.button!==0||event.shiftKey)return;
    if(selectPointers.size){for(const pointer of selectPointers.values())pointer.moved=true;}
    selectPointers.set(event.pointerId,{x:event.clientX,y:event.clientY,moved:selectPointers.size>0});
  });
  canvas.addEventListener('pointermove',event=>{
    const pointer=selectPointers.get(event.pointerId);
    if(pointer&&Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>8)pointer.moved=true;
  });
  canvas.addEventListener('pointercancel',event=>{selectPointers.delete(event.pointerId);});
  canvas.addEventListener('pointerup',event=>{
    const pointer=selectPointers.get(event.pointerId);selectPointers.delete(event.pointerId);
    if(!selectEdges||!image||!pointer||pointer.moved||selectPointers.size)return;
    const rect=canvas.getBoundingClientRect();
    const index=nearestContour(image,view,event.clientX-rect.left,event.clientY-rect.top,
      selectedContours());
    if(index<0){imageStatus.textContent='Tap a highlighted edge to add it as a stroke.';return;}
    cancel();state=appendStroke(state,contourToStroke(image,image.contours[index]));
    imported.set(index,state.strokes.at(-1)!);
    imageStatus.textContent='Edge added. Select more edges or click Find functions.';update();
  });
  const fileInput=root.querySelector<HTMLInputElement>('[data-image-file]')!;
  fileInput.addEventListener('change',()=>{
    const file=fileInput.files?.[0];fileInput.value='';
    if(!file)return;
    const version=++imageVersion;edgeWorker.cancel();
    imageStatus.textContent='Opening image…';
    void loadImage(file).then(reference=>{
      if(version!==imageVersion){closeImage(reference);return;}
      cancel();if(image)closeImage(image);image=reference;imported.clear();
      view.fitImage(reference.bounds.xMax,reference.bounds.yMax);
      state={...createUiState(),mode:state.mode};selectEdges=true;refreshImageControls();update();
      void detect(root.querySelector<HTMLSelectElement>('[data-image-detail] select')!.value as EdgeDetail);
    }).catch(error=>{
      if(version===imageVersion)imageStatus.textContent=error instanceof Error?error.message:'Could not open image.';
    });
  });
  root.querySelector<HTMLSelectElement>('[data-image-detail] select')!.addEventListener('change',event=>{
    if(!image)return;
    void detect((event.target as HTMLSelectElement).value as EdgeDetail);
  });
  root.querySelector<HTMLButtonElement>('[data-action="image-tool"]')!.addEventListener('click',()=>{
    selectEdges=!selectEdges;refreshImageControls();
    imageStatus.textContent=selectEdges?'Tap a highlighted edge to add it as a stroke.':
      'Draw on the coordinate plane over the image.';
  });
  root.querySelector<HTMLButtonElement>('[data-action="remove-image"]')!.addEventListener('click',()=>{
    removeImage();draw();
  });
  root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.addEventListener('click',request);
  root.querySelectorAll<HTMLInputElement>('input[name="fit-mode"]').forEach(input=>input.addEventListener('change',()=>{
    if(!input.checked)return;
    cancel();state={...state,mode:input.value as FitMode,result:null,phase:'idle'};update();
  }));
  root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-simplify]').forEach(input=>input.addEventListener('change',()=>{
    root.querySelector<HTMLFieldSetElement>('[data-simplicity-options]')!.disabled=
      !root.querySelector<HTMLInputElement>('[data-simplify="enabled"]')!.checked;
    cancel();state={...state,result:null,phase:'idle',selected:'accurate'};update();
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
