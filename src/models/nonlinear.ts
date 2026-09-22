import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';
import {fitLm,type LmModel} from '../math/lm';
import {constant,variable,add,mul,type Expr} from '../expr/ast';
import {simplify} from '../expr/simplify';
import {draft} from './shared';

export const c=constant;
export const exp=(arg:Expr):Expr=>({kind:'exp',arg});
export const div=(a:Expr,b:Expr):Expr=>({kind:'div',a,b});
export function worldInput(data:CurveData):Expr{
  const {xc,xs}=data.normalization;
  return simplify(mul(add(variable(),c(-xc)),c(1/xs)));
}
export function worldOutput(data:CurveData,normalized:Expr):Expr{
  const {yc,ys}=data.normalization;
  return simplify(add(mul(c(ys),normalized),c(yc)));
}
export function fitNonlinear(data:CurveData,family:string,model:LmModel,starts:number[][],builder:(p:Float64Array,u:Expr)=>Expr):CandidateDraft[]{
  const output:CandidateDraft[]=[];
  for(const initial of starts.slice(0,8)){
    const fit=fitLm(model,data.v,Float64Array.from(initial),{x:data.u,delta:Math.max(.01,1.5*data.sigmaDraw/data.normalization.ys),maxIterations:36});
    if(!Number.isFinite(fit.loss))continue;
    const expr=worldOutput(data,builder(fit.params,worldInput(data)));
    output.push(draft(expr,family,initial.length));
  }
  return output;
}
