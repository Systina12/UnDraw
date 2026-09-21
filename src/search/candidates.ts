import type { Candidate, CandidateResult, CurveData, Expr } from "../core/types";
import { evaluateExpr, exprToLatex, exprToPlain } from "../expr/ast";
import { complexity, structuralHash } from "../expr/canonical";
import { simplify } from "../expr/simplify";
import { huberError } from "../math/robust";
import { mean } from "../math/vector";

function valuesFor(expression: Expr, data: CurveData): Array<number | null> {
  return data.x.map((value) => evaluateExpr(expression, value));
}

function countConstants(expression: Expr): number {
  switch (expression.kind) {
    case "const": return 1;
    case "x":
    case "param": return 0;
    case "add":
    case "mul": return expression.args.reduce((total, arg) => total + countConstants(arg), 0);
    case "div": return countConstants(expression.a) + countConstants(expression.b);
    case "pow": return countConstants(expression.base) + countConstants(expression.exponent);
    default: return countConstants(expression.arg);
  }
}

export function semanticSignature(expression: Expr, domain: [number, number]): string {
  const values = Array.from({ length: 32 }, (_, index) => {
    const x = domain[0] + (index / 31) * (domain[1] - domain[0]);
    return evaluateExpr(expression, x);
  });
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (finite.length < 24) return `invalid:${structuralHash(expression)}`;
  const center = mean(finite);
  const deviation = Math.sqrt(mean(finite.map((value) => (value - center) ** 2))) || 1;
  return values.map((value) => value === null ? "!" : String(Math.round(((value - center) / deviation) * 1000))).join(",");
}

export function makeCandidate(
  rawExpression: Expr,
  modelFamily: string,
  data: CurveData,
  approximation = false,
  params: number[] = [],
): Candidate {
  const expr = simplify(rawExpression);
  const values = valuesFor(expr, data);
  const residuals = values.map((value, index) => value === null ? 1e6 : value - (data.y[index] ?? 0));
  const mse = mean(residuals.map((residual) => residual ** 2));
  const rmse = Math.sqrt(mse);
  const delta = Math.max(1.5 * data.noise, 0.01);
  const robust = huberError(residuals, delta);
  const c = complexity(expr);
  const score = data.y.length * Math.log(Math.max(mse, data.noise ** 2, 1e-12)) + (params.length + 0.7 * c + 0.15 * countConstants(expr)) * Math.log(Math.max(2, data.y.length));
  return {
    expr,
    params,
    error: rmse,
    robustError: robust,
    maxError: Math.max(...residuals.map(Math.abs)),
    complexity: c,
    score,
    signature: semanticSignature(expr, data.domain),
    modelFamily,
    approximation,
  };
}

export function toCandidateResult(candidate: Candidate, data: CurveData): CandidateResult {
  const plotX = Array.from({ length: 256 }, (_, index) => data.domain[0] + (index / 255) * (data.domain[1] - data.domain[0]));
  const plotY = plotX.map((value) => evaluateExpr(candidate.expr, value) ?? NaN);
  return {
    expr: candidate.expr,
    latex: exprToLatex(candidate.expr),
    plain: exprToPlain(candidate.expr),
    rmse: candidate.error,
    normalizedRmse: candidate.error / Math.max(1e-9, data.normalization.ys),
    robustError: candidate.robustError,
    maxError: candidate.maxError,
    complexity: candidate.complexity,
    score: candidate.score,
    modelFamily: candidate.modelFamily,
    approximation: candidate.approximation,
    plot: { x: plotX, y: plotY },
  };
}

export class CandidatePool {
  private readonly candidates = new Map<string, Candidate>();

  public constructor(_data: CurveData, private readonly maxSize = 300) {}

  public add(candidate: Candidate): void {
    if (!Number.isFinite(candidate.error) || candidate.signature.startsWith("invalid:")) return;
    const previous = this.candidates.get(candidate.signature);
    if (!previous || candidate.complexity < previous.complexity || (candidate.complexity === previous.complexity && candidate.error < previous.error)) {
      this.candidates.set(candidate.signature, candidate);
    }
    if (this.candidates.size > this.maxSize) {
      const keep = [...this.candidates.values()].sort((a, b) => a.score - b.score).slice(0, this.maxSize);
      this.candidates.clear();
      for (const item of keep) this.candidates.set(item.signature, item);
    }
  }

  public addMany(candidates: readonly Candidate[]): void {
    for (const candidate of candidates) this.add(candidate);
  }

  public all(): Candidate[] {
    return [...this.candidates.values()].sort((a, b) => a.score - b.score);
  }

  public frontier(): Candidate[] {
    const sorted = [...this.candidates.values()].sort((a, b) => a.complexity - b.complexity || a.error - b.error);
    const frontier: Candidate[] = [];
    for (const candidate of sorted) {
      const dominated = sorted.some((other) => other !== candidate && other.error <= candidate.error && other.complexity <= candidate.complexity && (other.error < candidate.error || other.complexity < candidate.complexity));
      if (!dominated) frontier.push(candidate);
    }
    return frontier.sort((a, b) => a.score - b.score);
  }
}

export function selectPresentationCandidates(frontier: readonly Candidate[], noise: number, observedY: readonly number[]): { simple: Candidate; balanced: Candidate; accurate: Candidate } {
  if (frontier.length === 0) throw new Error("Candidate pool is empty");
  const sortedByError = [...frontier].sort((a, b) => a.error - b.error);
  const minimum = sortedByError[0]!;
  const allowed = 2.5 * Math.max(noise, minimum.error);
  const simple = [...frontier].filter((candidate) => candidate.error <= allowed).sort((a, b) => a.complexity - b.complexity || a.score - b.score)[0] ?? minimum;
  const balanced = [...frontier].sort((a, b) => a.score - b.score)[0] ?? minimum;
  const variance = mean(observedY.map((value) => (value - mean(observedY)) ** 2));
  const cap = Math.max(simple.complexity + 8, 12);
  const accurate = [...frontier].filter((candidate) => candidate.complexity <= cap).sort((a, b) => a.error - b.error || a.complexity - b.complexity)[0] ?? (variance >= 0 ? minimum : balanced);
  return { simple, balanced, accurate };
}
