import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';
import {fitNonlinear,c,exp,div} from './nonlinear';
import {add,mul,pow,integer,type Expr} from '../expr/ast';

export function fitGaussian(data:CurveData):CandidateDraft[]{
  const peak=data.smoothY.indexOf(Math.max(...data.smoothY));
  const trough=data.smoothY.indexOf(Math.min(...data.smoothY));
  const start=(i:number,sign:number,width:number)=>[sign, data.u[i],Math.log(width), sign>0?-0.5:0.5];
  const starts=[start(peak,1,.5),start(peak,1,1),start(trough,-1,.5),start(trough,-1,1)];
  return fitNonlinear(data,'gaussian',(p,u)=>{
    const width=Math.exp(p[2]);
    if(width<.03||width>10)return NaN;
    return p[0]*Math.exp(-(((u-p[1])/width)**2))+p[3];
  },starts,(p,u):Expr=>add(mul(c(p[0]),exp(mul(c(-1),pow(div(add(u,c(-p[1])),c(Math.exp(p[2]))),integer(2))))),c(p[3])));
}
