import type {Point,SolverOptions,SolveResult,CandidateResult} from './types';
import type {CurveData} from './normalize';
import type {Candidate} from '../search/producer';
import {DEFAULT_OPTIONS} from './options';
import {preprocess,InvalidCurveError} from './preprocess';
import {CandidatePool} from '../search/candidatePool';
import {paretoPrune,selectRepresentatives} from '../search/pareto';
import {qualityOf} from './quality';
import {evaluate} from '../expr/evaluate';
import {toLatex} from '../expr/latex';
import {toPlain} from '../expr/plain';
import {fastModelBank} from '../search/modelBank';
import {beautifyPool} from '../beautify/beautify';
import {produceFallback} from '../search/fallback';
import {searchSymbolic} from '../search/symbolic';
import {solveParametric} from './parametric';
import {allowedChange,descriptionCost,relaxedCandidates,resolveSimplicity} from '../beautify/relaxed';
import type {SimplicityOptions} from './types';
import type {Expr} from '../expr/ast';

export function makeCandidateResult(candidate:Candidate,data:CurveData):CandidateResult {
  const x=Array.from(data.x);
  const y=x.map(v=>evaluate(candidate.expr,v).value);
  return {expr:candidate.expr,latex:toLatex(candidate.expr),plain:toPlain(candidate.expr),
    rmse:candidate.metrics.rmse,normalizedRmse:candidate.metrics.normalizedRmse,
    complexity:candidate.complexity,score:candidate.score,modelFamily:candidate.modelFamily,
    approximation:candidate.approximation,plot:{x,y}};
}

export function needsSymbolicSearch(pool:CandidatePool):boolean {
  const best=[...pool.all()].sort((a,b)=>a.score-b.score)[0];
  if(!best)return true;
  const familiar=new Set(['Polynomial','sinusoid','exponential','logarithm','absolute','rational',
    'gaussian','tanh','logistic','damped-sinusoid']);
  // A single pen jump raises RMSE without making a familiar shape less convincing.
  const robustScale=pool.data.normalization.ys*Math.sqrt(2*best.metrics.robustError);
  const close=robustScale<=Math.max(3.5*pool.data.sigmaDraw,.015*pool.data.normalization.ys);
  return best.approximation||!familiar.has(best.modelFamily)||
    (best.modelFamily==='Polynomial'&&best.complexity>12)||!close;
}

export function finalizeFunctionResult(pool:CandidatePool,data:CurveData,start:number,stopReason='completed',
  simplicity?:Partial<SimplicityOptions>,accept?:(expr:Expr)=>boolean):SolveResult {
  const frontier=accept?paretoPrune(pool.all().filter(candidate=>accept(candidate.expr))):pool.frontier();
  if(!frontier.length)throw new InvalidCurveError('no-finite-samples');
  const representatives=selectRepresentatives(frontier,data.sigmaDraw);
  const preference=resolveSimplicity(simplicity);
  let simple=representatives.simple,balanced=representatives.balanced;
  let choices=frontier;
  if(preference.enabled&&preference.tolerance>0){
    const baseline=representatives.balanced;
    const seed=[baseline,...pool.all().filter(candidate=>candidate.signature!==baseline.signature&&
      (!accept||accept(candidate.expr)))
      .sort((a,b)=>a.score-b.score||descriptionCost(a)-descriptionCost(b)).slice(0,4)];
    const alternatives=[...frontier.filter(candidate=>allowedChange(baseline,candidate,data,preference)),
      ...relaxedCandidates(baseline,seed,data,preference)]
      .filter(candidate=>!accept||accept(candidate.expr));
    const ranked=[baseline,...alternatives].sort((a,b)=>descriptionCost(a)-descriptionCost(b)||
      a.metrics.rmse-b.metrics.rmse);
    if(descriptionCost(ranked[0])<descriptionCost(balanced)-.1)balanced=ranked[0];
    simple=ranked[0];
    choices=[...new Map([...frontier,...alternatives].map(c=>[c.signature,c])).values()]
      .sort((a,b)=>descriptionCost(a)-descriptionCost(b)||a.metrics.rmse-b.metrics.rmse)
      .filter((candidate,index,array)=>!array.slice(0,index).some(prior=>
        descriptionCost(prior)<=descriptionCost(candidate)&&prior.metrics.rmse<=candidate.metrics.rmse));
  }
  const convert=(candidate:Candidate)=>makeCandidateResult(candidate,data);
  const simplified=balanced.signature!==representatives.balanced.signature;
  const quality=qualityOf(balanced,data.sigmaDraw);
  const originalQuality=qualityOf(representatives.balanced,data.sigmaDraw);
  return {mode:'function',simplified,best:convert(balanced),simple:convert(simple),
    balanced:convert(balanced),accurate:convert(representatives.accurate),
    pareto:choices.map(convert),domain:data.domain,noise:data.sigmaDraw,
    quality:simplified&&quality==='low'&&originalQuality!=='low'?'approximation':quality,
    diagnostics:{runtimeMs:performance.now()-start,candidatesGenerated:pool.generated,candidatesFitted:pool.size,
      candidatesRejected:pool.rejected,maxComplexityReached:0,stopReason}};
}

export function solveCurve(points:readonly Point[],options:Partial<SolverOptions>={}):SolveResult {
  const start=performance.now();
  const settings={...DEFAULT_OPTIONS,...options};
  const prepared=preprocess(points,settings.sampleCount);
  if(prepared.mode==='parametric'){
    if(!settings.enableParametricFallback)throw new InvalidCurveError('no-finite-samples');
    return solveParametric(prepared.data,settings,start);
  }
  const pool=new CandidatePool(prepared.data,settings.semanticBeamWidth);
  for(const candidate of fastModelBank(prepared.data))pool.add(candidate);
  for(const candidate of produceFallback(prepared.data))pool.add(candidate);
  beautifyPool(pool);
  let maxComplexityReached=0;
  if(settings.maxStructuralComplexity>0&&needsSymbolicSearch(pool)){
    const context={options:settings,deadline:settings.timeBudgetMs===null?Infinity:performance.now()+settings.timeBudgetMs,
      initialBestError:Math.min(...pool.all().map(candidate=>candidate.metrics.rmse)),
      shouldAbort:()=>false,now:()=>performance.now()};
    for(const candidate of searchSymbolic(prepared.data,context,level=>{maxComplexityReached=level;}))pool.add(candidate);
    beautifyPool(pool);
  }
  const result=finalizeFunctionResult(pool,prepared.data,start,'completed',settings.simplify);
  result.diagnostics.maxComplexityReached=maxComplexityReached;
  return result;
}
