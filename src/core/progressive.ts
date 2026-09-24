import type {Point,SolverOptions,SolveResult} from './types';
import {DEFAULT_OPTIONS} from './options';
import {preprocess,InvalidCurveError} from './preprocess';
import {CandidatePool} from '../search/candidatePool';
import {fastModelBank,quickModelBank} from '../search/modelBank';
import {finalizeFunctionResult,needsSymbolicSearch} from './solver';
import {beautifyPool} from '../beautify/beautify';
import {produceFallback} from '../search/fallback';
import {searchSymbolic} from '../search/symbolic';
import {createParametricAxisPool,fitParametricAxisStage,finalizeParametricResult} from './parametric';

export interface SolveHooks {
  now:()=>number;
  shouldAbort:()=>boolean;
  emit:(message:{stage:string;result?:SolveResult})=>void;
  yieldControl:()=>Promise<void>;
  onPhase?:(phase:'preprocess'|'fast-models'|'extended-models'|'fallback'|'beautify'|'symbolic'|'finalize'|
    'parametric-quick'|'parametric-extended'|'parametric-fallback',elapsedMs:number)=>void;
  onBeam?:(level:number,size:number)=>void;
}
export class CancelledSolve extends Error {}

export async function solveCurveProgressive(points:readonly Point[],options:Partial<SolverOptions>={},hooks:SolveHooks={
  now:()=>performance.now(),shouldAbort:()=>false,emit:()=>{},yieldControl:()=>new Promise(resolve=>setTimeout(resolve,0)),
}):Promise<SolveResult> {
  const start=hooks.now(),settings={...DEFAULT_OPTIONS,...options};
  const deadline=start+(settings.timeBudgetMs??1500);
  const expired=()=>hooks.now()>=deadline;
  if(hooks.shouldAbort())throw new CancelledSolve();
  const prepared=preprocess(points,settings.sampleCount);
  hooks.onPhase?.('preprocess',hooks.now()-start);
  if(prepared.mode==='parametric'){
    if(!settings.enableParametricFallback)throw new InvalidCurveError('no-finite-samples');
    const left=createParametricAxisPool(prepared.data,'x',settings.semanticBeamWidth);
    const right=createParametricAxisPool(prepared.data,'y',settings.semanticBeamWidth);
    let phaseStart=hooks.now();
    fitParametricAxisStage(left,'quick');
    fitParametricAxisStage(right,'quick');
    hooks.onPhase?.('parametric-quick',hooks.now()-phaseStart);
    let result=finalizeParametricResult(prepared.data,left,right,start);
    hooks.emit({stage:'fast-models',result});
    await hooks.yieldControl();
    if(hooks.shouldAbort())throw new CancelledSolve();
    if(!expired()){
      phaseStart=hooks.now();
      fitParametricAxisStage(left,'extended',expired);
      fitParametricAxisStage(right,'extended',expired);
      hooks.onPhase?.('parametric-extended',hooks.now()-phaseStart);
      result=finalizeParametricResult(prepared.data,left,right,start);
      hooks.emit({stage:'extended-models',result});
      await hooks.yieldControl();
      if(hooks.shouldAbort())throw new CancelledSolve();
    }
    if(!expired()){
      phaseStart=hooks.now();
      fitParametricAxisStage(left,'fallback',expired);
      fitParametricAxisStage(right,'fallback',expired);
      hooks.onPhase?.('parametric-fallback',hooks.now()-phaseStart);
      fitParametricAxisStage(left,'beautify',expired);
      fitParametricAxisStage(right,'beautify',expired);
      result=finalizeParametricResult(prepared.data,left,right,start);
    }
    if(expired())result.diagnostics.stopReason='deadline';
    if(settings.simplify.enabled)result=finalizeParametricResult(prepared.data,left,right,start,
      result.diagnostics.stopReason,settings.simplify);
    hooks.emit({stage:'finalize',result});
    return result;
  }
  const pool=new CandidatePool(prepared.data,settings.semanticBeamWidth);
  let phaseStart=hooks.now();
  for(const candidate of quickModelBank(prepared.data))pool.add(candidate);
  const fast=finalizeFunctionResult(pool,prepared.data,start);
  hooks.onPhase?.('fast-models',hooks.now()-phaseStart);
  hooks.emit({stage:'fast-models',result:fast});
  await hooks.yieldControl();
  if(hooks.shouldAbort())throw new CancelledSolve();
  if(!expired()){
    phaseStart=hooks.now();
    const previous=pool.generated;
    beautifyPool(pool);
    hooks.onPhase?.('beautify',hooks.now()-phaseStart);
    if(pool.generated>previous)hooks.emit({stage:'beautify',result:finalizeFunctionResult(pool,prepared.data,start)});
    await hooks.yieldControl();
    if(hooks.shouldAbort())throw new CancelledSolve();
  }
  if(expired()){
    const result=finalizeFunctionResult(pool,prepared.data,start,'deadline',settings.simplify);
    hooks.emit({stage:'finalize',result});
    return result;
  }
  phaseStart=hooks.now();
  for(const candidate of fastModelBank(prepared.data,expired)){
    if(expired())break;
    pool.add(candidate);
  }
  hooks.onPhase?.('extended-models',hooks.now()-phaseStart);
  hooks.emit({stage:'extended-models',result:finalizeFunctionResult(pool,prepared.data,start)});
  await hooks.yieldControl();
  if(hooks.shouldAbort())throw new CancelledSolve();
  if(expired()){
    const result=finalizeFunctionResult(pool,prepared.data,start,'deadline',settings.simplify);
    hooks.emit({stage:'finalize',result});
    return result;
  }
  phaseStart=hooks.now();
  for(const candidate of produceFallback(prepared.data,expired))pool.add(candidate);
  hooks.onPhase?.('fallback',hooks.now()-phaseStart);
  phaseStart=hooks.now();
  if(!expired())beautifyPool(pool);
  hooks.onPhase?.('beautify',hooks.now()-phaseStart);
  let maxComplexityReached=0;
  if(!expired()&&settings.maxStructuralComplexity>0&&needsSymbolicSearch(pool)){
    phaseStart=hooks.now();
    const context={options:settings,deadline,shouldAbort:hooks.shouldAbort,now:hooks.now,
      initialBestError:Math.min(...pool.all().map(candidate=>candidate.metrics.rmse))};
    let count=0;
    for(const candidate of searchSymbolic(prepared.data,context,(level,size)=>{
      maxComplexityReached=level;
      hooks.onBeam?.(level,size);
      if(level>0&&pool.size)hooks.emit({stage:`symbolic-${level}`,result:finalizeFunctionResult(pool,prepared.data,start)});
    })){
      pool.add(candidate);
      if(++count%16===0){await hooks.yieldControl();if(hooks.shouldAbort())throw new CancelledSolve();}
    }
    hooks.onPhase?.('symbolic',hooks.now()-phaseStart);
    phaseStart=hooks.now();
    if(!expired())beautifyPool(pool);
    hooks.onPhase?.('beautify',hooks.now()-phaseStart);
  }
  phaseStart=hooks.now();
  const result=finalizeFunctionResult(pool,prepared.data,start,expired()?'deadline':'completed',settings.simplify);
  result.diagnostics.maxComplexityReached=maxComplexityReached;
  hooks.onPhase?.('finalize',hooks.now()-phaseStart);
  hooks.emit({stage:'finalize',result});
  return result;
}
