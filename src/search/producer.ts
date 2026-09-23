import type {Expr} from '../expr/ast';
import type {CurveData} from '../core/normalize';
import type {SolverOptions} from '../core/types';

export interface CandidateDraft {
  expr:Expr;
  params:number[];
  modelFamily:string;
  freeParameterCount:number;
  approximation:boolean;
}
export interface Candidate extends CandidateDraft {
  metrics:{rmse:number;normalizedRmse:number;mseNormalized:number;robustError:number;maxError:number};
  complexity:number;
  score:number;
  signature:string;
}
export interface SolveContext {options:SolverOptions;deadline:number;shouldAbort:()=>boolean;
  now?:()=>number;initialBestError?:number}
export interface CandidateProducer {produce(data:CurveData,context:SolveContext):Iterable<CandidateDraft>|AsyncIterable<CandidateDraft>}
