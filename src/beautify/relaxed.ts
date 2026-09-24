import type {Expr,Constant} from '../expr/ast';
import {numericConstant} from '../expr/ast';
import {evaluate} from '../expr/evaluate';
import {toPlain} from '../expr/plain';
import {expressionConstantCost} from '../search/scoring';
import type {Candidate,CandidateDraft} from '../search/producer';
import {CandidatePool} from '../search/candidatePool';
import type {CurveData} from '../core/normalize';
import type {SimplicityOptions} from '../core/types';
import {DEFAULT_OPTIONS} from '../core/options';
import {prettyAlternatives} from './constants';
import {rationalNear} from './rational';

type Path=number[];
function children(expr:Expr):Expr[]{
  if(expr.kind==='add'||expr.kind==='mul')return expr.args;
  if(expr.kind==='div')return [expr.a,expr.b];
  if(expr.kind==='pow')return [expr.base,expr.exponent];
  return 'arg' in expr?[expr.arg]:[];
}
function floatPaths(expr:Expr,path:Path=[]):Path[]{
  if(expr.kind==='const')return expr.value.kind==='float'?[path]:[];
  return children(expr).flatMap((child,index)=>floatPaths(child,[...path,index]));
}
function at(expr:Expr,path:Path):Expr {
  return path.reduce((node,index)=>children(node)[index],expr);
}
function replace(expr:Expr,path:Path,value:Constant):Expr {
  if(!path.length)return {kind:'const',value};
  const [index,...rest]=path;
  if(expr.kind==='add'||expr.kind==='mul')return {...expr,args:expr.args.map((item,i)=>i===index?replace(item,rest,value):item)};
  if(expr.kind==='div')return {...expr,[index===0?'a':'b']:replace(index===0?expr.a:expr.b,rest,value)};
  if(expr.kind==='pow')return {...expr,[index===0?'base':'exponent']:replace(index===0?expr.base:expr.exponent,rest,value)};
  return 'arg' in expr?{...expr,arg:replace(expr.arg,rest,value)}:expr;
}

export function resolveSimplicity(options?:Partial<SimplicityOptions>):SimplicityOptions {
  const defaults=DEFAULT_OPTIONS.simplify as SimplicityOptions;
  const combined={...defaults,...options};
  return {...combined,tolerance:Number.isFinite(combined.tolerance)?
    Math.max(0,Math.min(.15,combined.tolerance)):.05};
}

/** Extra description cost for printed digits beyond the first. */
export function descriptionCost(candidate:Candidate):number {
  let digits=0;
  function visit(expr:Expr):void {
    if(expr.kind==='const'&&expr.value.kind==='float'){
      const rendered=Number(expr.value.value.toPrecision(6)).toString();
      digits+=Math.max(0,(rendered.match(/\d/g)?.length??0)-1)*.42;
    }else children(expr).forEach(visit);
  }
  visit(candidate.expr);
  return candidate.complexity+digits;
}

/** Separate the difference from the original fit into offset, gain, and remaining shape. */
export function allowedChange(base:Candidate,trial:Candidate,data:CurveData,options:SimplicityOptions):boolean {
  const n=data.x.length,scale=Math.max(data.normalization.ys,1e-8),budget=options.tolerance*scale;
  if(!n||budget<=0)return false;
  let sumBase=0,sumDiff=0,sumDiffSq=0,sumBaseSq=0,sumCross=0,maxDiff=0;
  for(const x of data.x){
    const original=evaluate(base.expr,x),changed=evaluate(trial.expr,x);
    if(!original.valid||!changed.valid)return false;
    const difference=changed.value-original.value;
    sumBase+=original.value;sumDiff+=difference;
    sumDiffSq+=difference*difference;sumBaseSq+=original.value**2;
    sumCross+=original.value*difference;maxDiff=Math.max(maxDiff,Math.abs(difference));
  }
  const shift=sumDiff/n,variance=Math.max(0,sumBaseSq/n-(sumBase/n)**2);
  const covariance=sumCross/n-sumBase/n*shift;
  const gain=variance>scale**2*1e-8?covariance/variance:0;
  const scaleRms=Math.abs(gain)*Math.sqrt(variance);
  const deformation=Math.sqrt(Math.max(0,sumDiffSq/n-shift**2-scaleRms**2));
  const noiseAllowance=Math.max(1e-7*scale,1e-9);
  if(Math.abs(shift)>(options.translation?budget:noiseAllowance))return false;
  if(scaleRms>(options.scaling?budget:noiseAllowance))return false;
  if(deformation>(options.deformation?budget:noiseAllowance))return false;
  if(Math.sqrt(sumDiffSq/n)>budget||maxDiff>3*budget)return false;
  return trial.metrics.rmse<=base.metrics.rmse+budget+1e-9;
}

function alternatives(value:number,tolerance:number):Constant[]{
  const window=Math.max(.012,Math.abs(value)*.25,tolerance*5);
  const output:Constant[]=[...prettyAlternatives(value,6)];
  for(const {p,q} of rationalNear(value))output.push(q===1?{kind:'integer',value:p}:{kind:'rational',p,q});
  for(const basis of [{kind:'piMultiple',number:Math.PI},{kind:'eMultiple',number:Math.E}] as const)
    for(const {p,q} of rationalNear(value/basis.number).slice(0,4))output.push({kind:basis.kind,p,q});
  for(const precision of [0,1,2]){
    const rounded=Number(value.toFixed(precision));
    output.push(precision===0?{kind:'integer',value:rounded}:{kind:'float',value:rounded});
  }
  const unique=new Map<string,Constant>();
  for(const candidate of output){
    const actual=numericConstant(candidate);
    if(!Number.isFinite(actual)||Math.abs(actual-value)>window||Math.abs(actual-value)<1e-12)continue;
    unique.set(`${candidate.kind}:${actual}`,candidate);
  }
  return [...unique.values()].sort((a,b)=>{
    const cost=(c:Constant)=>c.kind==='float'?toPlain({kind:'const',value:c}).length:
      expressionConstantCost({kind:'const',value:c});
    return cost(a)+Math.abs(numericConstant(a)-value)/window*3-
      cost(b)-Math.abs(numericConstant(b)-value)/window*3;
  }).slice(0,7);
}

/** Bounded local search; every proposal is evaluated on the original sampled stroke. */
export function relaxedCandidates(base:Candidate,seeds:readonly Candidate[],data:CurveData,
  options:SimplicityOptions):Candidate[]{
  if(!options.enabled||!options.tolerance)return [];
  const accepted=new Map<string,Candidate>();
  for(const seed of seeds.slice(0,5)){
    const paths=floatPaths(seed.expr).slice(0,7);
    // Keep the unsimplified tree so later paths still point to the same parameters.
    let beam:{expr:Expr;candidate:Candidate;fixed:number}[]=[
      {expr:seed.expr,candidate:seed,fixed:0}];
    for(const path of paths){
      const leaf=at(seed.expr,path);
      if(leaf.kind!=='const'||leaf.value.kind!=='float')continue;
      const next=[...beam];
      for(const state of beam)for(const alternative of alternatives(leaf.value.value,options.tolerance)){
        const expr=replace(state.expr,path,alternative);
        const draft:CandidateDraft={...state.candidate,expr,
          freeParameterCount:Math.max(0,seed.freeParameterCount-state.fixed-1)};
        const probe=new CandidatePool(data,1);
        if(!probe.add(draft))continue;
        const candidate=probe.all()[0];
        if(!allowedChange(base,candidate,data,options))continue;
        accepted.set(candidate.signature,candidate);
        next.push({expr,candidate,fixed:state.fixed+1});
      }
      next.sort((a,b)=>descriptionCost(a.candidate)-descriptionCost(b.candidate)||
        a.candidate.metrics.rmse-b.candidate.metrics.rmse);
      beam=next.slice(0,10);
    }
  }
  return [...accepted.values()].sort((a,b)=>descriptionCost(a)-descriptionCost(b)||
    a.metrics.rmse-b.metrics.rmse).slice(0,24);
}
