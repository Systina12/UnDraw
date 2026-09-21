import type { CandidateResult } from "../core/types";
import { exprToLatex, exprToPlain } from "../expr/ast";

export function formatParametricLatex(xCandidate: CandidateResult, yCandidate: CandidateResult): string {
  return `\\begin{aligned}x(t) &= ${exprToLatex(xCandidate.expr, "t")}\\\\y(t) &= ${exprToLatex(yCandidate.expr, "t")}\\end{aligned}`;
}

export function formatParametricPlain(xCandidate: CandidateResult, yCandidate: CandidateResult): string {
  return `x(t) = ${exprToPlain(xCandidate.expr, "t")}; y(t) = ${exprToPlain(yCandidate.expr, "t")}`;
}
