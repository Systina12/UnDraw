import type { Candidate, CurveData, Expr } from "../core/types";
import { c } from "../expr/ast";
import { makeCandidate } from "../search/candidates";
import { prettyAlternatives } from "./constants";

function replaceConstant(expression: Expr, target: number, replacement: Expr, state: { seen: number }): Expr {
  if (expression.kind === "const") {
    if (state.seen === target) {
      state.seen += 1;
      return replacement;
    }
    state.seen += 1;
    return expression;
  }
  if (expression.kind === "x" || expression.kind === "param") return expression;
  if (expression.kind === "add" || expression.kind === "mul") return { ...expression, args: expression.args.map((arg) => replaceConstant(arg, target, replacement, state)) };
  if (expression.kind === "div") return { kind: "div", a: replaceConstant(expression.a, target, replacement, state), b: replaceConstant(expression.b, target, replacement, state) };
  if (expression.kind === "pow") return { kind: "pow", base: replaceConstant(expression.base, target, replacement, state), exponent: replaceConstant(expression.exponent, target, replacement, state) };
  return { ...expression, arg: replaceConstant(expression.arg, target, replacement, state) };
}

function constantsIn(expression: Expr): Expr[] {
  if (expression.kind === "const") return [expression];
  if (expression.kind === "x" || expression.kind === "param") return [];
  if (expression.kind === "add" || expression.kind === "mul") return expression.args.flatMap(constantsIn);
  if (expression.kind === "div") return [...constantsIn(expression.a), ...constantsIn(expression.b)];
  if (expression.kind === "pow") return [...constantsIn(expression.base), ...constantsIn(expression.exponent)];
  return constantsIn(expression.arg);
}

export function beautifyCandidate(candidate: Candidate, data: CurveData): Candidate {
  const constants = constantsIn(candidate.expr);
  let beam: Candidate[] = [candidate];
  for (let index = 0; index < constants.length; index += 1) {
    const next: Candidate[] = [];
    for (const item of beam) {
      const currentConstants = constantsIn(item.expr);
      const current = currentConstants[index];
      if (!current || current.kind !== "const") {
        next.push(item);
        continue;
      }
      for (const alternative of prettyAlternatives(current.value)) {
        const expression = replaceConstant(item.expr, index, c(alternative), { seen: 0 });
        next.push(makeCandidate(expression, candidate.modelFamily, data, candidate.approximation, candidate.params));
      }
    }
    beam = next.sort((a, b) => a.score - b.score).slice(0, 32);
  }
  return beam.sort((a, b) => a.score - b.score)[0] ?? candidate;
}
