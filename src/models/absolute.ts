import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';
import {projectLinear,draft} from './shared';
import {minimizeBounded} from '../math/brent';
import {constant,variable,add,mul,type Expr} from '../expr/ast';
import {simplify} from '../expr/simplify';

export function fitAbsolute(data:CurveData,withTrend=false):CandidateDraft[]{
  const project=(breakpoint:number)=>projectLinear(data,u=>withTrend?[Math.abs(u-breakpoint),u,1]:[Math.abs(u-breakpoint),1]);
  const grid=Array.from({length:30},(_,i)=>-.98+i*1.96/29);
  const seeds=grid.map(b=>({b,error:project(b)?.error??Infinity})).sort((a,b)=>a.error-b.error).slice(0,2);
  return seeds.flatMap(seed=>{
    const best=minimizeBounded(b=>project(b)?.error??Infinity,Math.max(-.999,seed.b-.16),Math.min(.999,seed.b+.16),1e-5);
    const fit=project(best.x);if(!fit)return [];
    const {xc,xs,yc,ys}=data.normalization;
    const slope=withTrend?ys*fit.coefficients[1]/xs:0;
    const offset=yc+ys*fit.coefficients[withTrend?2:1]-slope*xc;
    const arg:Expr=simplify(add(variable(),constant(-xc-xs*best.x)));
    const expr:Expr=simplify(add(mul(constant(ys*fit.coefficients[0]/xs),{kind:'abs',arg}),
      mul(constant(slope),variable()),constant(offset)));
    return [draft(expr,'absolute',withTrend?4:3)];
  });
}
