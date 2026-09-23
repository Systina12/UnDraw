import {expect,it,vi} from 'vitest';
import {createAppShell} from '../../src/ui/app';
import {solveCurve} from '../../src/core/solver';
import {makeStroke} from '../fixtures/generateStroke';

it('restores the solved expression when a second finger turns a stroke into navigation',async()=>{
  const result=solveCurve(makeStroke(x=>x,{min:-2,max:2,count:16}),{maxStructuralComplexity:0});
  const batch={kind:'multi',mode:'per-stroke',groups:[{strokeIndices:[0],result}],skipped:[]};
  const requests:unknown[]=[];
  class FakeWorker {
    onmessage:((event:MessageEvent)=>void)|null=null;
    onerror:((event:ErrorEvent)=>void)|null=null;
    postMessage(request:{id:number}):void {
      requests.push(request);
      queueMicrotask(()=>this.onmessage?.({data:{id:request.id,type:'batch-done',result:batch}} as MessageEvent));
    }
    terminate():void {}
  }
  vi.stubGlobal('Worker',FakeWorker);
  const getContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const root=document.createElement('div');
  document.body.append(root);
  try {
    const canvas=createAppShell(root);
    const captured=new Set<number>();
    canvas.setPointerCapture=vi.fn(id=>captured.add(id));
    canvas.releasePointerCapture=vi.fn(id=>captured.delete(id));
    canvas.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100} as DOMRect);
    const pointer=(type:string,pointerId:number,pointerType:string,x:number)=>canvas.dispatchEvent(
      Object.assign(new Event(type),{pointerId,pointerType,button:0,clientX:x,clientY:50}));
    pointer('pointerdown',1,'mouse',30);
    pointer('pointermove',1,'mouse',70);
    pointer('pointerup',1,'mouse',70);
    root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.click();
    await Promise.resolve();
    const formula=root.querySelector<HTMLElement>('[data-formula]')!;
    const before=formula.textContent;
    expect(before).toContain('x');
    expect(requests).toHaveLength(1);
    pointer('pointerdown',2,'touch',40);
    pointer('pointerdown',3,'touch',60);
    expect(captured.has(2)).toBe(true);
    expect(captured.has(3)).toBe(true);
    pointer('pointermove',2,'touch',50);
    pointer('pointermove',3,'touch',70);
    pointer('pointerup',2,'touch',50);
    pointer('pointerup',3,'touch',70);
    expect(requests).toHaveLength(1);
    expect(formula.textContent).toBe(before);
    root.querySelector<HTMLButtonElement>('[data-choice="simple"]')!.click();
    expect(formula.textContent).toContain('x');
    expect(root.querySelector<HTMLButtonElement>('[data-action="copy-latex"]')!.disabled).toBe(false);
  } finally {
    root.remove();
    getContext.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('keeps the previous solve running when a new touch becomes a two-finger gesture',()=>{
  const result=solveCurve(makeStroke(x=>x,{min:-2,max:2,count:16}),{maxStructuralComplexity:0});
  const batch={kind:'multi',mode:'per-stroke',groups:[{strokeIndices:[0],result}],skipped:[]};
  const requests:{id:number}[]=[];
  let worker:FakeWorker;
  let terminated=false;
  class FakeWorker {
    onmessage:((event:MessageEvent)=>void)|null=null;
    onerror:((event:ErrorEvent)=>void)|null=null;
    constructor(){worker=this;}
    postMessage(request:{id:number}):void{requests.push(request);}
    terminate():void{terminated=true;}
  }
  vi.stubGlobal('Worker',FakeWorker);
  const getContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const root=document.createElement('div');
  document.body.append(root);
  try {
    const canvas=createAppShell(root);
    canvas.setPointerCapture=vi.fn();
    canvas.releasePointerCapture=vi.fn();
    canvas.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100} as DOMRect);
    const pointer=(type:string,id:number,pointerType:string,x:number)=>canvas.dispatchEvent(
      Object.assign(new Event(type),{pointerId:id,pointerType,button:0,clientX:x,clientY:50}));
    pointer('pointerdown',1,'mouse',30);
    pointer('pointermove',1,'mouse',70);
    pointer('pointerup',1,'mouse',70);
    root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.click();
    expect(requests).toHaveLength(1);
    pointer('pointerdown',2,'touch',40);
    pointer('pointerdown',3,'touch',60);
    pointer('pointerup',2,'touch',40);
    pointer('pointerup',3,'touch',60);
    expect(terminated).toBe(false);
    expect(requests).toHaveLength(1);
    worker!.onmessage?.({data:{id:requests[0].id,type:'batch-done',result:batch}} as MessageEvent);
    expect(root.querySelector('[data-formula]')!.textContent).toContain('x');
  } finally {
    root.remove();
    getContext.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('cancels a previous solve once one-finger motion confirms a new stroke',()=>{
  const requests:{id:number}[]=[];
  let terminated=0;
  class FakeWorker {
    onmessage:((event:MessageEvent)=>void)|null=null;
    onerror:((event:ErrorEvent)=>void)|null=null;
    postMessage(request:{id:number}):void{requests.push(request);}
    terminate():void{terminated++;}
  }
  vi.stubGlobal('Worker',FakeWorker);
  const getContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const root=document.createElement('div');
  document.body.append(root);
  try {
    const canvas=createAppShell(root);
    canvas.setPointerCapture=vi.fn();
    canvas.releasePointerCapture=vi.fn();
    canvas.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100} as DOMRect);
    const pointer=(type:string,id:number,pointerType:string,x:number)=>canvas.dispatchEvent(
      Object.assign(new Event(type),{pointerId:id,pointerType,button:0,clientX:x,clientY:50}));
    pointer('pointerdown',1,'mouse',30);
    pointer('pointermove',1,'mouse',70);
    pointer('pointerup',1,'mouse',70);
    root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.click();
    expect(requests).toHaveLength(1);
    expect(terminated).toBe(0);

    pointer('pointerdown',2,'touch',10);
    pointer('pointermove',2,'touch',13);
    expect(terminated).toBe(0);
    pointer('pointermove',2,'touch',40);
    expect(terminated).toBe(1);
    expect(requests).toHaveLength(1);
    pointer('pointermove',2,'touch',80);
    expect(terminated).toBe(1);
    pointer('pointerup',2,'touch',80);
    expect(requests).toHaveLength(1);
    root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.click();
    expect(requests).toHaveLength(2);
  } finally {
    root.remove();
    getContext.mockRestore();
    vi.unstubAllGlobals();
  }
});
