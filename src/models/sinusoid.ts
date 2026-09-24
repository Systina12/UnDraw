import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from '../search/producer';
import {leastSquares} from '../math/leastSquares';
import {minimizeBounded} from '../math/brent';
import {spectralPeaks} from '../math/fft';
import {huberWeights} from '../math/robust';
import {type Expr,constant,variable,mul,add} from '../expr/ast';
import {simplify} from '../expr/simplify';
import {draft} from './shared';

interface TrigFit {omega:number;coefficients:Float64Array;error:number}
function linearFit(data:CurveData,omega:number,k:number,trend:boolean):TrigFit|null{
  const n=data.x.length,cols=1+(trend?1:0)+2*k;
  const matrix=new Float64Array(n*cols);
  for(let i=0;i<n;i++){
    matrix[i*cols]=1;let index=1;
    if(trend)matrix[i*cols+index++]=data.u[i];
    for(let j=1;j<=k;j++){matrix[i*cols+index++]=Math.sin(j*omega*data.u[i]);matrix[i*cols+index++]=Math.cos(j*omega*data.u[i]);}
  }
  try{
    let fitted=leastSquares(matrix,n,cols,data.v,data.weights);
    if(fitted.rank<cols)return null;
    const residual=Float64Array.from(data.v,(y,i)=>{
      let estimate=0;for(let j=0;j<cols;j++)estimate+=matrix[i*cols+j]*fitted.coefficients[j];return estimate-y;
    });
    const weights=huberWeights(residual,Math.max(1.5*data.sigmaDraw/data.normalization.ys,.01));
    for(let i=0;i<n;i++)weights[i]*=data.weights[i];
    fitted=leastSquares(matrix,n,cols,data.v,weights);
    if(fitted.rank<cols)return null;
    // Closely spaced harmonic columns can be formally full rank yet require
    // enormous opposite amplitudes to reproduce an O(1) normalized stroke.
    // Their printed phases cannot retain that cancellation at display precision.
    const coefficientMass=fitted.coefficients.reduce((sum,value)=>sum+Math.abs(value),0);
    if(!Number.isFinite(coefficientMass)||coefficientMass>24)return null;
    let error=0;
    for(let i=0;i<n;i++){
      let estimate=0;for(let j=0;j<cols;j++)estimate+=matrix[i*cols+j]*fitted.coefficients[j];
      error+=(estimate-data.v[i])**2;
    }
    return {omega,coefficients:fitted.coefficients,error:error/n};
  }catch{return null;}
}

function toDraft(data:CurveData,fit:TrigFit,k:number,trend:boolean):CandidateDraft {
  const {xc,xs,yc,ys}=data.normalization;
  const values=fit.coefficients;
  const terms:Expr[]=[];
  const slope=trend?ys*values[1]/xs:0;
  const offset=yc+ys*values[0]-slope*xc;
  if(Math.abs(offset)>1e-10)terms.push(constant(offset));
  if(Math.abs(slope)>1e-10)terms.push(mul(constant(slope),variable()));
  const start=trend?2:1;
  for(let j=1;j<=k;j++){
    const a=values[start+2*(j-1)],b=values[start+2*(j-1)+1];
    const amplitude=ys*Math.hypot(a,b);
    if(amplitude<1e-9)continue;
    const frequency=j*fit.omega/xs;
    const phase=Math.atan2(b,a)-frequency*xc;
    const normalizedPhase=Math.atan2(Math.sin(phase),Math.cos(phase));
    const arg=simplify(add(mul(constant(frequency),variable()),constant(normalizedPhase)));
    terms.push(mul(constant(amplitude),{kind:'sin',arg}));
  }
  return draft(simplify(add(...terms)),k===1?'sinusoid':'fourier',1+2*k+(trend?1:0)+1,k>4);
}

export function fitHarmonic(data:CurveData,k=1,trend=false):CandidateDraft[]{
  const du=data.u[1]-data.u[0];
  const peaks=spectralPeaks(data.smoothY,du,5);
  const seeds=[...peaks,Math.PI,2*Math.PI,Math.PI/2,3*Math.PI];
  const selected=new Set<number>();
  for(const seed of seeds){
    for(const divider of [1,2,3]){
      const frequency=seed/divider;
      if(frequency>.3&&frequency<35)selected.add(Math.round(frequency*20)/20);
    }
  }
  for(let frequency=.6;frequency<22;frequency+=.6)selected.add(Math.round(frequency*20)/20);
  const ranked=[...selected].map(omega=>linearFit(data,omega,k,trend)).filter((v):v is TrigFit=>v!==null).sort((a,b)=>a.error-b.error).slice(0,k===1?4:2);
  const fits:TrigFit[]=[];
  for(const seed of ranked){
    const optimum=minimizeBounded(w=>linearFit(data,w,k,trend)?.error??Infinity,
      Math.max(.2,seed.omega-.55),Math.min(36,seed.omega+.55),1e-5);
    const fitted=linearFit(data,optimum.x,k,trend);
    if(fitted&&fits.every(other=>Math.abs(other.omega-fitted.omega)>.08))fits.push(fitted);
  }
  return fits.map(fit=>toDraft(data,fit,k,trend));
}
export function fitSinusoid(data:CurveData,withTrend=false):CandidateDraft[]{return fitHarmonic(data,1,withTrend);}
