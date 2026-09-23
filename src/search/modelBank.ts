import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from './producer';
import {fitPolynomial} from '../models/polynomial';
import {fitSinusoid} from '../models/sinusoid';
import {fitFourier} from '../models/fourier';
import {extractFeatures,prioritizeModels} from '../core/features';
import {fitExponential} from '../models/exponential';
import {fitLogarithm} from '../models/logarithm';
import {fitAbsolute} from '../models/absolute';
import {fitRational} from '../models/rational';
import {fitGaussian} from '../models/gaussian';
import {fitTanh} from '../models/tanh';
import {fitLogistic} from '../models/logistic';
import {fitDampedSinusoid} from '../models/dampedSinusoid';

export function* quickModelBank(data:CurveData):Iterable<CandidateDraft>{
  for(let degree=0;degree<=4;degree++){
    const candidate=fitPolynomial(data,degree);if(candidate)yield candidate;
  }
  if((data.features?.periodicity??0)>.4)yield* fitSinusoid(data);
  if((data.features?.cusp??0)>.5)yield* fitAbsolute(data);
}

export function* fastModelBank(data:CurveData):Iterable<CandidateDraft>{
  const families=prioritizeModels(data.features??extractFeatures(data));
  for(const family of families){
    if(family==='polynomial')for(let degree=0;degree<=8;degree++){
      const candidate=fitPolynomial(data,degree);
      if(candidate)yield candidate;
    }
    if(family==='sinusoid'){yield* fitSinusoid(data);yield* fitSinusoid(data,true);}
    if(family==='fourier')for(let harmonics=2;harmonics<=5;harmonics++)yield* fitFourier(data,harmonics);
    if(family==='exponential')yield* fitExponential(data);
    if(family==='logarithm')yield* fitLogarithm(data);
    if(family==='absolute'){yield* fitAbsolute(data);yield* fitAbsolute(data,true);}
    if(family==='rational')for(let m=0;m<=3;m++)for(let n=1;n<=2;n++){
      const candidate=fitRational(data,m,n);if(candidate)yield candidate;
    }
    if(family==='gaussian')yield* fitGaussian(data);
    if(family==='tanh')yield* fitTanh(data);
    if(family==='logistic')yield* fitLogistic(data);
    if(family==='damped-sinusoid')yield* fitDampedSinusoid(data);
  }
}
