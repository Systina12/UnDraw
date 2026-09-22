import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from './producer';
import {fitPolynomial} from '../models/polynomial';

export function* fastModelBank(data:CurveData):Iterable<CandidateDraft>{
  for(let degree=0;degree<=8;degree++){
    const candidate=fitPolynomial(data,degree);
    if(candidate)yield candidate;
  }
}
