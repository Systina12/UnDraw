import type {Candidate} from '../search/producer';
import type {SolveResult} from './types';
export function qualityFromError(rmse:number,noise:number,approximation:boolean):SolveResult['quality']{
  const ratio=rmse/Math.max(noise,1e-9);
  if(approximation)return ratio<=6?'approximation':'low';
  if(ratio<=1.5)return 'excellent';
  if(ratio<=3)return 'good';
  if(ratio<=6)return 'approximation';
  return 'low';
}
export function qualityOf(candidate:Candidate,noise:number):SolveResult['quality']{
  return qualityFromError(candidate.metrics.rmse,noise,candidate.approximation);
}
