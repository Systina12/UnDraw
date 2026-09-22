import type { Candidate, Constant, CurveData, Expr } from "../core/types";
import { c } from "../expr/ast";
import { makeCandidate } from "../search/candidates";
import { prettyAlternatives } from "./constants";

interface ConstantSlot {
  path: string;
  value: Constant;
}

interface BeamState {
  replacements: Array<Constant | undefined>;
  candidate: Candidate;
}

function collectConstantSlots(expression: Expr, path = ""): ConstantSlot[] {
  if (expression.kind === "const") return [{ path, value: expression.value }];
  if (expression.kind === "x" || expression.kind === "param") return [];
  if (expression.kind === "add" || expression.kind === "mul") {
    return expression.args.flatMap((arg, index) => collectConstantSlots(arg, `${path}args.${index}.`));
  }
  if (expression.kind === "div") {
    return [...collectConstantSlots(expression.a, `${path}a.`), ...collectConstantSlots(expression.b, `${path}b.`)];
  }
  if (expression.kind === "pow") {
    return [...collectConstantSlots(expression.base, `${path}base.`), ...collectConstantSlots(expression.exponent, `${path}exponent.`)];
  }
  return collectConstantSlots(expression.arg, `${path}arg.`);
}

function replaceConstants(
  expression: Expr,
  slots: readonly ConstantSlot[],
  replacements: readonly (Constant | undefined)[],
  path = "",
): Expr {
  const slotIndex = slots.findIndex((slot) => slot.path === path);
  const replacement = slotIndex >= 0 ? replacements[slotIndex] : undefined;
  if (replacement) return c(replacement);
  if (expression.kind === "x" || expression.kind === "param" || expression.kind === "const") return expression;
  if (expression.kind === "add" || expression.kind === "mul") {
    return { ...expression, args: expression.args.map((arg, index) => replaceConstants(arg, slots, replacements, `${path}args.${index}.`)) };
  }
  if (expression.kind === "div") {
    return {
      kind: "div",
      a: replaceConstants(expression.a, slots, replacements, `${path}a.`),
      b: replaceConstants(expression.b, slots, replacements, `${path}b.`),
    };
  }
  if (expression.kind === "pow") {
    return {
      kind: "pow",
      base: replaceConstants(expression.base, slots, replacements, `${path}base.`),
      exponent: replaceConstants(expression.exponent, slots, replacements, `${path}exponent.`),
    };
  }
  return { ...expression, arg: replaceConstants(expression.arg, slots, replacements, `${path}arg.`) };
}

export function beautifyCandidate(candidate: Candidate, data: CurveData): Candidate {
  const slots = collectConstantSlots(candidate.expr).slice(0, 8);
  let beam: BeamState[] = [{ replacements: [], candidate }];
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (!slot) continue;
    const next: BeamState[] = [];
    for (const state of beam) {
      for (const alternative of prettyAlternatives(slot.value)) {
        const replacements = [...state.replacements, alternative];
        const expression = replaceConstants(candidate.expr, slots, replacements);
        next.push({
          replacements,
          candidate: makeCandidate(expression, candidate.modelFamily, data, candidate.approximation, candidate.params),
        });
      }
    }
    beam = next.sort((a, b) => a.candidate.score - b.candidate.score).slice(0, 128);
  }
  const tolerance = Math.max(2 * data.noise, 0.005);
  return beam
    .map((state) => state.candidate)
    .filter((item) => item.error <= candidate.error + tolerance)
    .sort((a, b) => a.complexity - b.complexity || a.score - b.score)[0]
    ?? beam.sort((a, b) => a.candidate.score - b.candidate.score)[0]?.candidate
    ?? candidate;
}
