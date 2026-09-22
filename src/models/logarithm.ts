import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';
import {projectLinear,draft} from './shared';
import {minimizeBounded} from '../math/brent';
import {constant,variable,add,mul,type Expr} from '../expr/ast';
import {simplify} from '../expr/simplify';

export function fitLogarithm(data:CurveData):CandidateDraft[]{
  const output:CandidateDraft[]=[];
  for(const direction of [1,-1]){
    const project=(logGap:number)=>{
      const shift=(direction===1?data.u[0]:data.u.at(-1)!)-direction*Math.exp(logGap);
      return projectLinear(data,u=>[Math.log(direction*(u-shift)),1]);
    };
    const seeds=Array.from({length:25},(_,i)=>-5+i*8/24)
      .map(logGap=>({logGap,error:project(logGap)?.error??Infinity})).sort((a,b)=>a.error-b.error).slice(0,2);
    for(const seed of seeds){
      const best=minimizeBounded(projectValue=>project(projectValue)?.error??Infinity,
        Math.max(-6,seed.logGap-.4),Math.min(4,seed.logGap+.4),1e-5);
      const fit=project(best.x);if(!fit)continue;
      const {xc,xs,yc,ys}=data.normalization;
      const shift=(direction===1?data.u[0]:data.u.at(-1)!)-direction*Math.exp(best.x);
      const worldShift=xc+xs*shift;
      const input=simplify(add(mul(constant(direction),variable()),constant(-direction*worldShift)));
      const a=ys*fit.coefficients[0];
      const expr:Expr=simplify(add(mul(constant(a),{kind:'log',arg:input}),constant(yc+ys*fit.coefficients[1]-a*Math.log(xs))));
      output.push(draft(expr,'logarithm',3));
    }
  }
  return output;
}
