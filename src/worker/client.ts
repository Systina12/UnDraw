import type {Point,Viewport,SolverOptions,FitMode} from '../core/types';
import type {WorkerResponse,WorkerRequest} from './protocol';

export class WorkerClient {
  private worker:Worker|null=null;
  private activeId=0;
  private nextId=1;
  constructor(private readonly factory:()=>Worker=()=>new Worker(new URL('./solver.worker.ts',import.meta.url),{type:'module'})){}
  solve(points:Point[],view:Viewport,options:Partial<SolverOptions>,onMessage:(message:WorkerResponse)=>void):number {
    this.worker?.terminate();
    const id=this.nextId++;
    this.activeId=id;
    const worker=this.factory();this.worker=worker;
    worker.onmessage=event=>{
      const message=event.data as WorkerResponse;
      if(this.activeId===id&&message.id===id)onMessage(message);
    };
    worker.onerror=()=>{if(this.activeId===id)onMessage({type:'invalid',id,reason:'worker-failed'});};
    worker.postMessage({type:'solve',id,points,view,options} satisfies WorkerRequest);
    return id;
  }
  solveStrokes(strokes:Point[][],mode:FitMode,view:Viewport,options:Partial<SolverOptions>,
    onMessage:(message:WorkerResponse)=>void):number {
    this.worker?.terminate();
    const id=this.nextId++;
    this.activeId=id;
    const worker=this.factory();this.worker=worker;
    worker.onmessage=event=>{
      const message=event.data as WorkerResponse;
      if(this.activeId===id&&message.id===id)onMessage(message);
    };
    worker.onerror=()=>{if(this.activeId===id)onMessage({type:'invalid',id,reason:'worker-failed'});};
    worker.postMessage({type:'solve-strokes',id,strokes,mode,view,options} satisfies WorkerRequest);
    return id;
  }
  cancel(id=this.activeId):void {
    if(id!==this.activeId)return;
    this.activeId=0;
    this.worker?.terminate();this.worker=null;
  }
}
