import type {Candidate} from '../search/producer';
import type {SolveResult} from './types';
export function qualityOf(candidate:Candidate,noise:number):SolveResult['quality']{
  const ratio=candidate.metrics.rmse/Math.max(noise,1e-9);
  if(candidate.approximation)return ratio<=6?'approximation':'low';
  if(ratio<=1.5)return 'excellent';
  if(ratio<=3)return 'good';
  if(ratio<=6)return 'approximation';
  return 'low';
}
