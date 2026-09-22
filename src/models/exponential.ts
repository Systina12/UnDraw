import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';
import {projectLinear,draft} from './shared';
import {minimizeBounded} from '../math/brent';
import {constant,variable,add,mul,type Expr} from '../expr/ast';
import {simplify} from '../expr/simplify';

export function fitExponential(data:CurveData):CandidateDraft[]{
  const project=(rate:number)=>projectLinear(data,u=>[Math.exp(rate*u),1]);
  const grid=Array.from({length:33},(_,i)=>-10+i*20/32).filter(rate=>Math.abs(rate)>.12);
  const seeds=grid.map(rate=>({rate,error:project(rate)?.error??Infinity})).sort((a,b)=>a.error-b.error).slice(0,3);
  const output:CandidateDraft[]=[];
  for(const seed of seeds){
    const best=minimizeBounded(rate=>project(rate)?.error??Infinity,Math.max(-10,seed.rate-.7),Math.min(10,seed.rate+.7),1e-5);
    const fit=project(best.x);if(!fit)continue;
    const {xc,xs,yc,ys}=data.normalization;
    const input=simplify(add(mul(constant(best.x/xs),variable()),constant(-best.x*xc/xs)));
    const expr:Expr=simplify(add(mul(constant(ys*fit.coefficients[0]),{kind:'exp',arg:input}),constant(yc+ys*fit.coefficients[1])));
    output.push(draft(expr,'exponential',3));
  }
  return output;
}
