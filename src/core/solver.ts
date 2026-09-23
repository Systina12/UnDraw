import type {Point,SolverOptions,SolveResult,CandidateResult} from './types';
import type {CurveData} from './normalize';
import type {Candidate} from '../search/producer';
import {DEFAULT_OPTIONS} from './options';
import {preprocess,InvalidCurveError} from './preprocess';
import {CandidatePool} from '../search/candidatePool';
import {selectRepresentatives} from '../search/pareto';
import {qualityOf} from './quality';
import {evaluate} from '../expr/evaluate';
import {toLatex} from '../expr/latex';
import {toPlain} from '../expr/plain';
import {fastModelBank} from '../search/modelBank';
import {beautifyPool} from '../beautify/beautify';
import {produceFallback} from '../search/fallback';
import {searchSymbolic} from '../search/symbolic';

export function makeCandidateResult(candidate:Candidate,data:CurveData):CandidateResult {
  const x=Array.from(data.x);
  const y=x.map(v=>evaluate(candidate.expr,v).value);
  return {expr:candidate.expr,latex:toLatex(candidate.expr),plain:toPlain(candidate.expr),
    rmse:candidate.metrics.rmse,normalizedRmse:candidate.metrics.normalizedRmse,
    complexity:candidate.complexity,score:candidate.score,modelFamily:candidate.modelFamily,
    approximation:candidate.approximation,plot:{x,y}};
}

export function finalizeFunctionResult(pool:CandidatePool,data:CurveData,start:number,stopReason='completed'):SolveResult {
  const frontier=pool.frontier();
  if(!frontier.length)throw new InvalidCurveError('no-finite-samples');
  const representatives=selectRepresentatives(frontier,data.sigmaDraw);
  const convert=(candidate:Candidate)=>makeCandidateResult(candidate,data);
  return {mode:'function',best:convert(representatives.balanced),simple:convert(representatives.simple),
    balanced:convert(representatives.balanced),accurate:convert(representatives.accurate),
    pareto:frontier.map(convert),domain:data.domain,noise:data.sigmaDraw,
    quality:qualityOf(representatives.balanced,data.sigmaDraw),
    diagnostics:{runtimeMs:performance.now()-start,candidatesGenerated:pool.generated,candidatesFitted:pool.size,
      candidatesRejected:pool.rejected,maxComplexityReached:0,stopReason}};
}

export function solveCurve(points:readonly Point[],options:Partial<SolverOptions>={}):SolveResult {
  const start=performance.now();
  const settings={...DEFAULT_OPTIONS,...options};
  const prepared=preprocess(points,settings.sampleCount);
  if(prepared.mode==='parametric')throw new InvalidCurveError('no-finite-samples');
  const pool=new CandidatePool(prepared.data,settings.semanticBeamWidth);
  for(const candidate of fastModelBank(prepared.data))pool.add(candidate);
  for(const candidate of produceFallback(prepared.data))pool.add(candidate);
  beautifyPool(pool);
  const representative=pool.frontier().sort((a,b)=>a.score-b.score)[0];
  if(settings.maxStructuralComplexity>0&&(!representative||representative.complexity>12||
      representative.metrics.rmse>1.5*prepared.data.sigmaDraw)){
    const context={options:settings,deadline:performance.now()+(settings.timeBudgetMs??700),shouldAbort:()=>false,now:()=>performance.now()};
    for(const candidate of searchSymbolic(prepared.data,context,level=>{void level;}))pool.add(candidate);
    beautifyPool(pool);
  }
  return finalizeFunctionResult(pool,prepared.data,start);
}
