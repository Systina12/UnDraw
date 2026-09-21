import type { Constant } from "../core/types";
import { constantValue } from "../expr/ast";

function pushUnique(target: Constant[], candidate: Constant, value: number, original: number): void {
  const error = Math.abs(value - original);
  if (error > Math.max(0.025, 0.012 * Math.abs(original))) return;
  const key = JSON.stringify(candidate);
  if (!target.some((item) => JSON.stringify(item) === key)) target.push(candidate);
}

export function prettyAlternatives(constant: Constant): Constant[] {
  const original = constantValue(constant);
  if (!Number.isFinite(original)) return [constant];
  const alternatives: Constant[] = [constant];
  for (let integer = -10; integer <= 10; integer += 1) pushUnique(alternatives, { kind: "integer", value: integer }, integer, original);
  for (let denominator = 1; denominator <= 12; denominator += 1) {
    const numerator = Math.round(original * denominator);
    if (Math.abs(numerator) <= 48) pushUnique(alternatives, { kind: "rational", p: numerator, q: denominator }, numerator / denominator, original);
    const piNumerator = Math.round((original / Math.PI) * denominator);
    if (Math.abs(piNumerator) <= 48) pushUnique(alternatives, { kind: "piMultiple", p: piNumerator, q: denominator }, (piNumerator / denominator) * Math.PI, original);
    const eNumerator = Math.round((original / Math.E) * denominator);
    if (Math.abs(eNumerator) <= 48) pushUnique(alternatives, { kind: "eMultiple", p: eNumerator, q: denominator }, (eNumerator / denominator) * Math.E, original);
    for (let n = 2; n <= 10; n += 1) {
      const sqrtNumerator = Math.round((original / Math.sqrt(n)) * denominator);
      if (Math.abs(sqrtNumerator) <= 48) pushUnique(alternatives, { kind: "sqrtMultiple", p: sqrtNumerator, q: denominator, n }, (sqrtNumerator / denominator) * Math.sqrt(n), original);
    }
  }
  return alternatives.sort((a, b) => {
    const aScore = Math.abs(constantValue(a) - original) + (a.kind === "float" ? 0.01 : a.kind === "integer" ? 0 : a.kind === "rational" ? 0.002 * a.q : 0.003 * ("q" in a ? a.q : 1));
    const bScore = Math.abs(constantValue(b) - original) + (b.kind === "float" ? 0.01 : b.kind === "integer" ? 0 : b.kind === "rational" ? 0.002 * b.q : 0.003 * ("q" in b ? b.q : 1));
    return aScore - bScore;
  }).slice(0, 5);
}
