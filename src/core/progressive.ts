import type {Point,SolverOptions,SolveResult} from './types';
import {DEFAULT_OPTIONS} from './options';
import {preprocess,InvalidCurveError} from './preprocess';
import {CandidatePool} from '../search/candidatePool';
import {fastModelBank} from '../search/modelBank';
import {finalizeFunctionResult} from './solver';

export interface SolveHooks {
  now:()=>number;
  shouldAbort:()=>boolean;
  emit:(message:{stage:string;result?:SolveResult})=>void;
  yieldControl:()=>Promise<void>;
}
export class CancelledSolve extends Error {}

export async function solveCurveProgressive(points:readonly Point[],options:Partial<SolverOptions>={},hooks:SolveHooks={
  now:()=>performance.now(),shouldAbort:()=>false,emit:()=>{},yieldControl:()=>new Promise(resolve=>setTimeout(resolve,0)),
}):Promise<SolveResult> {
  const start=hooks.now(),settings={...DEFAULT_OPTIONS,...options};
  if(hooks.shouldAbort())throw new CancelledSolve();
  const prepared=preprocess(points,settings.sampleCount);
  if(prepared.mode==='parametric')throw new InvalidCurveError('no-finite-samples');
  const pool=new CandidatePool(prepared.data,settings.semanticBeamWidth);
  for(const candidate of fastModelBank(prepared.data))pool.add(candidate);
  const result=finalizeFunctionResult(pool,prepared.data,start);
  hooks.emit({stage:'fast-models',result});
  await hooks.yieldControl();
  if(hooks.shouldAbort())throw new CancelledSolve();
  hooks.emit({stage:'finalize',result});
  return result;
}
