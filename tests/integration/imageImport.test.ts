import {expect,it,vi} from 'vitest';
import {createAppShell} from '../../src/ui/app';

it('imports a locally detected contour as a stroke and waits for Find functions',async()=>{
  const messages:{id:number;pixels?:Uint8ClampedArray;strokes?:unknown[][]}[]=[];
  class FakeWorker {
    onmessage:((event:MessageEvent)=>void)|null=null;
    onerror:((event:ErrorEvent)=>void)|null=null;
    postMessage(request:(typeof messages)[number]):void{
      messages.push(request);
      if(request.pixels){
        const original={length:90,points:Array.from({length:90},(_,i)=>[i+15,30] as [number,number])};
        const unrelated={length:90,points:Array.from({length:90},(_,i)=>[i+15,65] as [number,number])};
        queueMicrotask(()=>this.onmessage?.({data:{id:request.id,
          contours:messages.length===1?[original]:[unrelated,original]}} as MessageEvent));
      }
    }
    terminate():void{}
  }
  vi.stubGlobal('Worker',FakeWorker);
  const source={width:120,height:80,close:vi.fn()} as unknown as ImageBitmap;
  const bitmap={width:120,height:80,close:vi.fn()} as unknown as ImageBitmap;
  vi.stubGlobal('createImageBitmap',vi.fn(async(input:File|HTMLCanvasElement)=>
    input instanceof File?source:bitmap));
  const scratchContext={fillStyle:'',fillRect:vi.fn(),drawImage:vi.fn(),
    getImageData:()=>({data:new Uint8ClampedArray(120*80*4)})};
  const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(function(this:HTMLCanvasElement){
    return this.isConnected?null:
      scratchContext as unknown as CanvasRenderingContext2D;
  });
  const root=document.createElement('div');document.body.append(root);
  try{
    const canvas=createAppShell(root);
    canvas.getBoundingClientRect=()=>({left:0,top:0,width:320,height:220} as DOMRect);
    const input=root.querySelector<HTMLInputElement>('[data-image-file]')!;
    Object.defineProperty(input,'files',{configurable:true,value:[new File(['image'],'curve.png',
      {type:'image/png'})]});
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(()=>expect(root.querySelector('[data-image-status]')?.textContent)
      .toContain('1 edges detected'));
    expect(root.querySelector('[data-image-status]')?.textContent).toContain('120 × 80 px');
    expect(messages).toHaveLength(1);
    expect(root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.disabled).toBe(true);
    const pointer=(type:string,id:number,x:number,y:number)=>canvas.dispatchEvent(Object.assign(new Event(type),{
      pointerId:id,pointerType:'mouse',button:0,clientX:x,clientY:y,
    }));
    pointer('pointerdown',1,160,85);pointer('pointerup',1,160,85);
    expect(root.querySelector('[data-formula]')!.textContent).toContain('1 stroke ready');
    expect(messages).toHaveLength(1);
    root.querySelector<HTMLButtonElement>('[data-action="fit"]')!.click();
    expect(messages[1].strokes).toHaveLength(1);
    expect(messages[1].strokes![0].length).toBe(90);
    const start=messages[1].strokes![0][0] as {x:number;y:number};
    const end=messages[1].strokes![0][89] as {x:number;y:number};
    expect(start.x).toBeCloseTo(15.5);
    expect(end.x).toBeCloseTo(104.5);
    expect(start.y).toBeCloseTo(49.5);
    const detail=root.querySelector<HTMLSelectElement>('[data-image-detail] select')!;
    detail.value='high';detail.dispatchEvent(new Event('change'));
    await vi.waitFor(()=>expect(root.querySelector('[data-image-status]')?.textContent)
      .toContain('2 edges detected'));
    pointer('pointerdown',5,160,85);pointer('pointerup',5,160,85);
    expect(root.querySelector('[data-formula]')!.textContent).toContain('Looking for');
    expect(root.querySelector('[data-image-status]')?.textContent).toContain('Tap a highlighted edge');
    root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
    expect(root.querySelector('[data-formula]')!.textContent).toContain('Draw one or more strokes');
    pointer('pointerdown',2,160,85);pointer('pointerup',2,160,85);
    expect(root.querySelector('[data-formula]')!.textContent).toContain('1 stroke ready');
    root.querySelector<HTMLButtonElement>('[data-action="clear"]')!.click();
    expect(root.querySelector('[data-formula]')!.textContent).toContain('Draw one or more strokes');
    expect(root.querySelector<HTMLButtonElement>('[data-action="image-tool"]')!.hidden).toBe(false);
    root.querySelector<HTMLButtonElement>('[data-action="remove-image"]')!.click();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(source.close).toHaveBeenCalledOnce();
    expect(root.querySelector<HTMLButtonElement>('[data-action="image-tool"]')!.hidden).toBe(true);
  }finally{context.mockRestore();root.remove();vi.unstubAllGlobals();}
});
