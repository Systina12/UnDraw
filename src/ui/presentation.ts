import type { CandidateResult } from "../core/types";
import { exprToLatex, exprToPlain } from "../expr/ast";

export interface ParametricPlot {
  x: number[];
  y: number[];
}

export function formatParametricLatex(xCandidate: CandidateResult, yCandidate: CandidateResult): string {
  return `\\begin{aligned}x(t) &= ${exprToLatex(xCandidate.expr, "t")}\\\\y(t) &= ${exprToLatex(yCandidate.expr, "t")}\\end{aligned}`;
}

export function formatParametricPlain(xCandidate: CandidateResult, yCandidate: CandidateResult): string {
  return `x(t) = ${exprToPlain(xCandidate.expr, "t")}; y(t) = ${exprToPlain(yCandidate.expr, "t")}`;
}

export function parametricPlot(xCandidate: CandidateResult, yCandidate: CandidateResult): ParametricPlot {
  const length = Math.min(xCandidate.plot.y.length, yCandidate.plot.y.length);
  return {
    x: Array.from({ length }, (_, index) => xCandidate.plot.y[index] ?? NaN),
    y: Array.from({ length }, (_, index) => yCandidate.plot.y[index] ?? NaN),
  };
}
