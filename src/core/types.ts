export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Point { x: number; y: number; t: number }

export interface SimplicityOptions {
  enabled: boolean;
  /** Allowed RMS deviation as a fraction of the scalar half-height or parametric half-diagonal. */
  tolerance: number;
  translation: boolean;
  scaling: boolean;
  deformation: boolean;
  /** Snap individual low-impact literals even when their change type is disabled. */
  coefficients: boolean;
}

export interface SolverOptions {
  sampleCount: number;
  functionBucketCount: number;
  maxStructuralComplexity: number;
  maxFreeParameters: number;
  semanticBeamWidth: number;
  combinationWidth: number;
  beautifyBeamWidth: number;
  timeBudgetMs: number | null;
  enableParametricFallback: boolean;
  deterministicSeed: number;
  simplify: Partial<SimplicityOptions>;
}

import type {Expr} from '../expr/ast';
export interface CandidateResult {
  expr: Expr;
  latex: string;
  plain: string;
  rmse: number;
  normalizedRmse: number;
  complexity: number;
  score: number;
  modelFamily?: string;
  approximation: boolean;
  plot: {x:number[];y:number[]};
  parametric?: {xExpr:Expr;yExpr:Expr;xLatex:string;yLatex:string;xPlain:string;yPlain:string};
}
export interface SolveResult {
  mode:'function'|'parametric';
  simplified?: boolean;
  best:CandidateResult;
  simple:CandidateResult;
  balanced:CandidateResult;
  accurate:CandidateResult;
  pareto:CandidateResult[];
  domain:[number,number];
  noise:number;
  quality:'excellent'|'good'|'approximation'|'low';
  diagnostics:{runtimeMs:number;candidatesGenerated:number;candidatesFitted:number;candidatesRejected:number;maxComplexityReached:number;stopReason:string};
}

export type FitMode = 'per-stroke' | 'auto';
export interface MultiSolveResult {
  kind: 'multi';
  mode: FitMode;
  groups: {strokeIndices:number[];result:SolveResult}[];
  skipped: number[];
}
