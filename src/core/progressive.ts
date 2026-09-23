import type {Point,SolverOptions,SolveResult} from './types';
import {DEFAULT_OPTIONS} from './options';
import {preprocess,InvalidCurveError} from './preprocess';
import {CandidatePool} from '../search/candidatePool';
import {fastModelBank} from '../search/modelBank';
import {finalizeFunctionResult} from './solver';
import {beautifyPool} from '../beautify/beautify';
import {produceFallback} from '../search/fallback';
import {searchSymbolic} from '../search/symbolic';

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
  const fast=finalizeFunctionResult(pool,prepared.data,start);
  hooks.emit({stage:'fast-models',result:fast});
  await hooks.yieldControl();
  if(hooks.shouldAbort())throw new CancelledSolve();
  for(const candidate of produceFallback(prepared.data))pool.add(candidate);
  beautifyPool(pool);
  const middle=finalizeFunctionResult(pool,prepared.data,start);
  if(settings.maxStructuralComplexity>0&&(middle.best.complexity>12||middle.best.rmse>1.5*prepared.data.sigmaDraw)){
    const context={options:settings,deadline:hooks.now()+(settings.timeBudgetMs??700),shouldAbort:hooks.shouldAbort,now:hooks.now};
    let count=0;
    for(const candidate of searchSymbolic(prepared.data,context,(level)=>{
      if(level>0&&pool.size)hooks.emit({stage:`symbolic-${level}`,result:finalizeFunctionResult(pool,prepared.data,start)});
    })){
      pool.add(candidate);
      if(++count%16===0){await hooks.yieldControl();if(hooks.shouldAbort())throw new CancelledSolve();}
    }
    beautifyPool(pool);
  }
  const result=finalizeFunctionResult(pool,prepared.data,start);
  hooks.emit({stage:'finalize',result});
  return result;
}
