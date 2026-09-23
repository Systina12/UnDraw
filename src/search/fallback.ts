import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from './producer';
import {fitPolynomial} from '../models/polynomial';
import {fitFourier} from '../models/fourier';
import {draft} from '../models/shared';
import {constant} from '../expr/ast';

export function produceFallback(data:CurveData):CandidateDraft[]{
  const candidates:CandidateDraft[]=[draft(constant(data.normalization.yc),'constant',1,true)];
  for(const degree of [4,6,8,10,12,16]){
    const result=fitPolynomial(data,degree);
    if(result)candidates.push({...result,modelFamily:'chebyshev-fallback',approximation:true});
  }
  if((data.features?.periodicity??0)>.4){
    for(const result of fitFourier(data,8))candidates.push({...result,modelFamily:'fourier-fallback',approximation:true});
  }
  return candidates;
}
