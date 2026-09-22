import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';
import {fitNonlinear,c,exp,div} from './nonlinear';
import {add,mul,integer,type Expr} from '../expr/ast';
export function fitLogistic(data:CurveData):CandidateDraft[]{
  const first=data.v[0],last=data.v.at(-1)!;
  const starts=[.8,2,4,7].map(rate=>[last-first,rate,0,first]);
  return fitNonlinear(data,'logistic',(p,u)=>{
    const z=Math.max(-30,Math.min(30,p[1]*(u-p[2])));
    return p[0]/(1+Math.exp(-z))+p[3];
  },starts,(p,u):Expr=>add(mul(c(p[0]),div(integer(1),add(integer(1),exp(mul(c(-p[1]),add(u,c(-p[2]))))))),c(p[3])));
}
