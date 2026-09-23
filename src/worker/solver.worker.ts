/// <reference lib="webworker" />
import {solveCurveProgressive,CancelledSolve} from '../core/progressive';
import {solveStrokesProgressive} from '../core/multi';
import {InvalidCurveError} from '../core/preprocess';
import type {WorkerRequest,WorkerResponse} from './protocol';

const worker=self as DedicatedWorkerGlobalScope;
let latest=0;
function send(message:WorkerResponse){worker.postMessage(message);}
worker.onmessage=event=>{
  const request=event.data as WorkerRequest;
  if(request.type==='cancel'){latest=Math.max(latest,request.id+1);return;}
  latest=request.id;
  if(request.type==='solve-strokes'){
    void solveStrokesProgressive(request.strokes,request.mode,request.options,{
      shouldAbort:()=>request.id!==latest,
      yieldControl:()=>new Promise(resolve=>setTimeout(resolve,0)),
      emit:result=>{if(request.id===latest)send({type:'batch-progress',id:request.id,result});},
    }).then(result=>{if(request.id===latest)send({type:'batch-done',id:request.id,result});})
      .catch(error=>{
        if(error instanceof CancelledSolve||request.id!==latest)return;
        send({type:'invalid',id:request.id,reason:error instanceof InvalidCurveError?error.reason:'solver-failed'});
      });
    return;
  }
  void solveCurveProgressive(request.points,request.options,{
    now:()=>performance.now(),shouldAbort:()=>request.id!==latest,
    yieldControl:()=>new Promise(resolve=>setTimeout(resolve,0)),
    emit:message=>{if(request.id===latest)send({type:'progress',id:request.id,...message});},
  }).then(result=>{if(request.id===latest)send({type:'done',id:request.id,result});})
    .catch(error=>{
      if(error instanceof CancelledSolve||request.id!==latest)return;
      send({type:'invalid',id:request.id,reason:error instanceof InvalidCurveError?error.reason:'solver-failed'});
    });
};
