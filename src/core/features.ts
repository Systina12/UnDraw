import type {CurveData} from './normalize';
import {spectralPeaks} from '../math/fft';
import {median} from '../math/statistics';

export interface CurveFeatures {
  extrema:number;zeroCrossings:number;monotonicity:number;evenError:number;oddError:number;
  cusp:number;periodicity:number;spectralPeaks:number[];curvaturePeaks:number[];
}
export function extractFeatures(data:CurveData):CurveFeatures {
  const y=data.smoothY,n=y.length,derivative:number[]=[],curvature:number[]=[],peaks:number[]=[];
  for(let i=1;i<n-1;i++)derivative[i]=(y[i+1]-y[i-1])/(data.x[i+1]-data.x[i-1]);
  let extrema=0,zeroCrossings=0,direction=0;
  for(let i=2;i<n-2;i++){
    curvature[i]=Math.abs((derivative[i+1]-derivative[i-1])/(data.x[i+1]-data.x[i-1]));
    if(derivative[i-1]*derivative[i+1]<0&&Math.abs(derivative[i+1]-derivative[i-1])>.02*data.normalization.ys/data.normalization.xs){
      if(i>4&&(!peaks.length||i-peaks.at(-1)!>5)){extrema++;peaks.push(i);}
    }
    if(y[i]*y[i+1]<0)zeroCrossings++;
    direction+=Math.sign(derivative[i]);
  }
  const sortedCurvature=[...curvature].filter(Number.isFinite).sort((a,b)=>a-b);
  const baseline=median(sortedCurvature),high=sortedCurvature.at(Math.floor(.98*sortedCurvature.length))??0;
  const cusp=Math.max(0,Math.min(1,(high/Math.max(baseline,1e-8)-3)/15));
  let even=0,odd=0,total=0;
  for(let i=0;i<n/2;i++){
    const a=data.v[i],b=data.v[n-1-i];even+=(a-b)**2;odd+=(a+b)**2;total+=a*a+b*b;
  }
  const spectral=spectralPeaks(y,data.u[1]-data.u[0],5);
  return {extrema,zeroCrossings,monotonicity:Math.abs(direction)/Math.max(1,n-4),
    evenError:even/Math.max(total,1e-8),oddError:odd/Math.max(total,1e-8),
    cusp,periodicity:extrema>=2?Math.min(1,extrema/3):0,spectralPeaks:spectral,curvaturePeaks:peaks.map(i=>data.x[i])};
}

const FAMILIES=['polynomial','sinusoid','fourier','exponential','logarithm','absolute','rational','gaussian','tanh','logistic','damped-sinusoid'];
export function prioritizeModels(features:CurveFeatures):string[]{
  const score:Record<string,number>={};
  for(const family of FAMILIES)score[family]=0;
  score.sinusoid=features.periodicity*5;
  score.fourier=features.periodicity*4;
  score.absolute=features.cusp*6;
  score.exponential=features.monotonicity*2;
  score.polynomial=features.extrema<=1?3:0;
  return [...FAMILIES].sort((a,b)=>score[b]-score[a]||a.localeCompare(b));
}
