import {expect,it,vi} from 'vitest';
import {createAppShell} from '../../src/ui/app';
import {solveCurve} from '../../src/core/solver';
import {makeStroke} from '../fixtures/generateStroke';

it('waits for Find functions, sends every stroke and invalidates results on a mode change',async()=>{
  const line=solveCurve(makeStroke(x=>x,{min:-2,max:2,count:16}),{maxStructuralComplexity:0});
  const requests:{id:number;mode:string;strokes:{x:number;y:number;t:number}[][];
    options:{simplify:{enabled:boolean;translation:boolean;scaling:boolean;deformation:boolean;tolerance:number}}}[]=[];
  class FakeWorker {
    onmessage:((event:MessageEvent)=>void)|null=null;
    onerror:((event:ErrorEvent)=>void)|null=null;
    postMessage(request:(typeof requests)[number]):void{
      requests.push(request);
      const groups=request.strokes.map((_,i)=>({strokeIndices:[i],result:line}));
      queueMicrotask(()=>this.onmessage?.({data:{type:'batch-done',id:request.id,
        result:{kind:'multi',mode:request.mode,groups,skipped:[]}}} as MessageEvent));
    }
    terminate():void{}
  }
  vi.stubGlobal('Worker',FakeWorker);
  const getContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const root=document.createElement('div');document.body.append(root);
  try{
    const canvas=createAppShell(root);
    canvas.setPointerCapture=vi.fn();canvas.releasePointerCapture=vi.fn();
    canvas.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100} as DOMRect);
    const pointer=(type:string,id:number,x:number,y:number)=>canvas.dispatchEvent(Object.assign(new Event(type),{
      pointerId:id,pointerType:'mouse',button:0,clientX:x,clientY:y,
    }));
    pointer('pointerdown',1,30,60);pointer('pointermove',1,70,40);pointer('pointerup',1,70,40);
    pointer('pointerdown',2,30,35);pointer('pointermove',2,70,15);pointer('pointerup',2,70,15);
    expect(requests).toHaveLength(0);
    expect(root.querySelector('[data-formula]')!.textContent).toContain('2 strokes ready');
    root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.click();
    expect(requests).toHaveLength(1);
    expect(requests[0].strokes).toHaveLength(2);
    expect(requests[0].mode).toBe('per-stroke');
    expect(requests[0].options.simplify.enabled).toBe(false);
    await Promise.resolve();
    expect(root.querySelectorAll('.formula-row')).toHaveLength(2);
    const automatic=root.querySelector<HTMLInputElement>('input[value="auto"]')!;
    automatic.checked=true;automatic.dispatchEvent(new Event('change'));
    expect(root.querySelector('[data-formula]')!.textContent).toContain('2 strokes ready');
    root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.click();
    expect(requests[1].mode).toBe('auto');
    root.querySelector<HTMLElement>('.simplicity-settings')!.setAttribute('open','');
    const enable=root.querySelector<HTMLInputElement>('[data-simplify="enabled"]')!;
    enable.checked=true;enable.dispatchEvent(new Event('change'));
    expect(root.querySelector<HTMLFieldSetElement>('[data-simplicity-options]')!.disabled).toBe(false);
    root.querySelector<HTMLSelectElement>('[data-simplify="tolerance"]')!.value='0.10';
    root.querySelector<HTMLInputElement>('[data-simplify="deformation"]')!.checked=true;
    root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.click();
    expect(requests[2].options.simplify).toEqual({enabled:true,translation:true,scaling:true,
      deformation:true,tolerance:.1});
    root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
    expect(root.querySelector('[data-formula]')!.textContent).toContain('1 stroke ready');
  }finally{
    getContext.mockRestore();root.remove();vi.unstubAllGlobals();
  }
});
