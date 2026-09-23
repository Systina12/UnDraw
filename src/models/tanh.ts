import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';
import {fitNonlinear,c} from './nonlinear';
import {add,mul,type Expr} from '../expr/ast';

export function fitTanh(data:CurveData):CandidateDraft[]{
  const ends=[data.v[0],data.v.at(-1)!],amp=(ends[1]-ends[0])/2,baseline=(ends[1]+ends[0])/2;
  const starts=[.6,1.5,3,5].map(rate=>[amp,rate,0,baseline]);
  return fitNonlinear(data,'tanh',(p,u)=>p[0]*Math.tanh(p[1]*u+p[2])+p[3],starts,(p,u):Expr=>{
    const argument=add(mul(c(p[1]),u),c(p[2]));
    return add(mul(c(p[0]),{kind:'tanh',arg:argument}),c(p[3]));
  });
}
