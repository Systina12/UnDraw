export interface Point {
  x: number;
  y: number;
  t: number;
}

export interface XY {
  x: number;
  y: number;
}

export interface Viewport {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  width: number;
  height: number;
}

export type SolveMode = "function" | "parametric";

export interface SolverOptions {
  samples: number;
  buckets: number;
  maxComplexity: number;
  timeBudgetMs: number;
  parametricFallback: boolean;
  maxCandidates: number;
  maxParams: number;
  progress?: (candidate: CandidateResult) => void;
  now?: () => number;
}

export const DEFAULT_SOLVER_OPTIONS: SolverOptions = {
  samples: 256,
  buckets: 128,
  maxComplexity: 12,
  timeBudgetMs: 1500,
  parametricFallback: true,
  maxCandidates: 300,
  maxParams: 8,
};

export interface Normalization {
  xc: number;
  xs: number;
  yc: number;
  ys: number;
}

export interface CurveData {
  raw: Point[];
  smooth: Point[];
  normalized: Point[];
  x: number[];
  y: number[];
  smoothY: number[];
  normalizedX: number[];
  normalizedY: number[];
  normalization: Normalization;
  domain: [number, number];
  noise: number;
  sourcePoints: Point[];
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  spreadRatio: number;
  effectiveBuckets: number;
}

export interface FeatureSummary {
  extrema: number;
  zeroCrossings: number;
  monotonicity: number;
  symmetry: number;
  periodicity: number;
  spectralPeaks: number[];
  cuspScore: number;
  trend: number;
}

export type Constant =
  | { kind: "float"; value: number }
  | { kind: "integer"; value: number }
  | { kind: "rational"; p: number; q: number }
  | { kind: "piMultiple"; p: number; q: number }
  | { kind: "eMultiple"; p: number; q: number }
  | { kind: "sqrtMultiple"; p: number; q: number; n: number };

export type Expr =
  | { kind: "x" }
  | { kind: "param"; index: number }
  | { kind: "const"; value: Constant }
  | { kind: "add"; args: Expr[] }
  | { kind: "mul"; args: Expr[] }
  | { kind: "div"; a: Expr; b: Expr }
  | { kind: "pow"; base: Expr; exponent: Expr }
  | { kind: "sin"; arg: Expr }
  | { kind: "cos"; arg: Expr }
  | { kind: "exp"; arg: Expr }
  | { kind: "log"; arg: Expr }
  | { kind: "abs"; arg: Expr }
  | { kind: "sqrt"; arg: Expr }
  | { kind: "tanh"; arg: Expr };

export interface Candidate {
  expr: Expr;
  params: number[];
  error: number;
  robustError: number;
  maxError: number;
  complexity: number;
  score: number;
  signature: string;
  modelFamily: string;
  approximation: boolean;
}

export interface CandidateResult {
  expr: Expr;
  latex: string;
  plain: string;
  rmse: number;
  normalizedRmse: number;
  robustError: number;
  maxError: number;
  complexity: number;
  score: number;
  modelFamily?: string;
  approximation?: boolean;
  plot: { x: number[]; y: number[] };
}

export interface Diagnostics {
  runtimeMs: number;
  candidatesGenerated: number;
  candidatesFitted: number;
  maxComplexityReached: number;
}

export type Quality = "excellent" | "good" | "approximation" | "low";

export interface SolveResult {
  mode: SolveMode;
  best: CandidateResult;
  simple: CandidateResult;
  balanced: CandidateResult;
  accurate: CandidateResult;
  pareto: CandidateResult[];
  domain: [number, number];
  noise: number;
  quality: Quality;
  diagnostics: Diagnostics;
  features?: FeatureSummary;
  parametric?: { x: CandidateResult; y: CandidateResult; t: number[] };
}

export interface InvalidSolveResult {
  mode: "invalid";
  reason: string;
  diagnostics: Diagnostics;
}

export type SolveOutcome = SolveResult | InvalidSolveResult;

export interface SolveContext {
  options: Required<Pick<SolverOptions, "samples" | "buckets" | "maxComplexity" | "timeBudgetMs" | "parametricFallback" | "maxCandidates" | "maxParams">> & {
    progress?: (candidate: CandidateResult) => void;
    now: () => number;
  };
  deadline: number;
  now: () => number;
}

export interface CandidateProducer {
  name: string;
  produce(data: CurveData, context: SolveContext, features?: FeatureSummary): Candidate[];
}

export interface WorkerRequest {
  id: number;
  points: Point[];
  view: Viewport;
  options?: Partial<SolverOptions>;
}

export interface WorkerProgress {
  type: "progress";
  id: number;
  stage: string;
  candidate?: CandidateResult;
}

export interface WorkerDone {
  type: "done";
  id: number;
  result: SolveResult;
}

export interface WorkerInvalid {
  type: "invalid";
  id: number;
  reason: string;
}

export type WorkerResponse = WorkerProgress | WorkerDone | WorkerInvalid;
