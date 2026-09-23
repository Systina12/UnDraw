import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';
import {spectralPeaks} from '../math/fft';
import {projectLinear} from './shared';
import {fitNonlinear,c,exp} from './nonlinear';
import {add,mul,type Expr} from '../expr/ast';

export function fitDampedSinusoid(data:CurveData):CandidateDraft[]{
  const peaks=spectralPeaks(data.smoothY,data.u[1]-data.u[0],3);
  const starts:number[][]=[];
  for(const rate of [-.3,0,.3])for(const omega of [...peaks.slice(0,2),4,8]){
    if(omega<.3||omega>30)continue;
    const fit=projectLinear(data,u=>[Math.exp(rate*u)*Math.sin(omega*u),Math.exp(rate*u)*Math.cos(omega*u),1]);
    if(fit)starts.push([rate,fit.coefficients[0],fit.coefficients[1],omega,fit.coefficients[2]]);
  }
  starts.sort((a,b)=>Math.abs(a[3]-4)-Math.abs(b[3]-4));
  return fitNonlinear(data,'damped-sinusoid',(p,u)=>{
    if(Math.abs(p[0]*u)>25)return NaN;
    return Math.exp(p[0]*u)*(p[1]*Math.sin(p[3]*u)+p[2]*Math.cos(p[3]*u))+p[4];
  },starts.slice(0,6),(p,u):Expr=>{
    const wave=add(mul(c(p[1]),{kind:'sin',arg:mul(c(p[3]),u)}),mul(c(p[2]),{kind:'cos',arg:mul(c(p[3]),u)}));
    return add(mul(exp(mul(c(p[0]),u)),wave),c(p[4]));
  });
}
