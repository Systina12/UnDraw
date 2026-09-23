import type {Point,Viewport,SolverOptions,SolveResult,FitMode,MultiSolveResult} from '../core/types';
export type WorkerRequest =
  | {type:'solve';id:number;points:Point[];view:Viewport;options:Partial<SolverOptions>}
  | {type:'solve-strokes';id:number;strokes:Point[][];mode:FitMode;view:Viewport;options:Partial<SolverOptions>}
  | {type:'cancel';id:number};
export type WorkerResponse =
  | {type:'progress';id:number;stage:string;result?:SolveResult}
  | {type:'done';id:number;result:SolveResult}
  | {type:'batch-progress'|'batch-done';id:number;result:MultiSolveResult}
  | {type:'invalid';id:number;reason:string};
