import type { Constant, Expr } from "../core/types";
import { c, constantValue } from "./ast";
import { canonicalize, structuralHash } from "./canonical";

function numeric(expression: Expr): number | null {
  if (expression.kind !== "const") return null;
  return constantValue(expression.value);
}

function negateConstant(constant: Constant): Constant {
  switch (constant.kind) {
    case "float": return { kind: "float", value: -constant.value };
    case "integer": return { kind: "integer", value: -constant.value };
    case "rational": return { kind: "rational", p: -constant.p, q: constant.q };
    case "piMultiple": return { kind: "piMultiple", p: -constant.p, q: constant.q };
    case "eMultiple": return { kind: "eMultiple", p: -constant.p, q: constant.q };
    case "sqrtMultiple": return { kind: "sqrtMultiple", p: -constant.p, q: constant.q, n: constant.n };
  }
}

interface SignedExpression {
  positive: Expr;
  negative: boolean;
}

function splitNegative(expression: Expr): SignedExpression | null {
  const value = numeric(expression);
  if (value !== null && value < -1e-12 && expression.kind === "const") {
    return { positive: c(negateConstant(expression.value)), negative: true };
  }
  if (expression.kind !== "mul") return null;
  const numericFactors = expression.args
    .map((arg, index) => ({ arg, index, value: numeric(arg) }))
    .filter((item): item is { arg: Expr; index: number; value: number } => item.value !== null);
  const product = numericFactors.reduce((total, item) => total * item.value, 1);
  if (product >= -1e-12) return null;
  const signIndex = numericFactors.find((item) => item.value < -1e-12)?.index;
  if (signIndex === undefined) return null;
  const factors = expression.args.map((arg, index) => index === signIndex && arg.kind === "const" ? c(negateConstant(arg.value)) : arg);
  return { positive: canonicalize({ kind: "mul", args: factors }), negative: true };
}

function monomialPower(base: Expr, power: number): Expr | null {
  if (!Number.isInteger(power) || power < 2) return null;
  const factors = base.kind === "mul" ? base.args : [base];
  const constantFactors = factors.filter((factor) => numeric(factor) !== null);
  const variableFactors = factors.filter((factor) => numeric(factor) === null);
  if (constantFactors.length !== 1 || variableFactors.length !== 1) return null;
  const coefficient = numeric(constantFactors[0]!);
  if (coefficient === null || !Number.isFinite(coefficient)) return null;
  return canonicalize({
    kind: "mul",
    args: [c(coefficient ** power), { kind: "pow", base: variableFactors[0]!, exponent: c(power) }],
  });
}

function phaseReduction(value: number): number {
  const period = 2 * Math.PI;
  return ((value + Math.PI) % period + period) % period - Math.PI;
}

function splitPhase(expression: Expr): { base: Expr; phase: number } | null {
  const terms = expression.kind === "add" ? expression.args : [expression];
  const constantIndex = terms.findIndex((term) => numeric(term) !== null);
  if (constantIndex < 0 || terms.length !== 2) return null;
  const phase = numeric(terms[constantIndex]!);
  const base = terms[constantIndex === 0 ? 1 : 0];
  return phase === null || !base ? null : { base, phase: phaseReduction(phase) };
}

function binomialCoefficient(n: number, k: number): number {
  let result = 1;
  for (let index = 1; index <= k; index += 1) result *= (n - index + 1) / index;
  return result;
}

function affinePower(base: Expr, power: number): Expr | null {
  if (!Number.isInteger(power) || power < 2 || power > 4) return null;
  if (base.kind === "x") return null;
  const line = affine(base);
  if (!line || !Number.isFinite(line.x) || !Number.isFinite(line.c)) return null;
  const terms: Expr[] = [];
  for (let k = 0; k <= power; k += 1) {
    const coefficient = binomialCoefficient(power, k) * line.c ** (power - k) * line.x ** k;
    if (Math.abs(coefficient) < 1e-12) continue;
    if (k === 0) terms.push(c(coefficient));
    else if (k === 1) terms.push(canonicalize({ kind: "mul", args: [c(coefficient), { kind: "x" }] }));
    else terms.push(canonicalize({ kind: "mul", args: [c(coefficient), { kind: "pow", base: { kind: "x" }, exponent: c(k) }] }));
  }
  return terms.length > 0 ? { kind: "add", args: terms } : c(0);
}

function scaleConstant(constant: Extract<Expr, { kind: "const" }> ["value"], factor: number): Extract<Expr, { kind: "const" }> ["value"] | null {
  if (!Number.isInteger(factor)) return null;
  switch (constant.kind) {
    case "integer": return { kind: "integer", value: constant.value * factor };
    case "float": return { kind: "float", value: constant.value * factor };
    case "rational": return { kind: "rational", p: constant.p * factor, q: constant.q };
    case "piMultiple": return { kind: "piMultiple", p: constant.p * factor, q: constant.q };
    case "eMultiple": return { kind: "eMultiple", p: constant.p * factor, q: constant.q };
    case "sqrtMultiple": return { kind: "sqrtMultiple", p: constant.p * factor, q: constant.q, n: constant.n };
  }
}

interface Affine {
  x: number;
  c: number;
}

function affine(expression: Expr): Affine | null {
  const value = numeric(expression);
  if (value !== null) return { x: 0, c: value };
  if (expression.kind === "x") return { x: 1, c: 0 };
  if (expression.kind === "add") {
    const parts = expression.args.map(affine);
    if (parts.some((part) => part === null)) return null;
    return parts.reduce<Affine>((total, part) => ({ x: total.x + (part?.x ?? 0), c: total.c + (part?.c ?? 0) }), { x: 0, c: 0 });
  }
  if (expression.kind === "mul") {
    const parts = expression.args.map(affine);
    if (parts.some((part) => part === null)) return null;
    const affineParts = parts.filter((part): part is Affine => part !== null);
    const variableParts = affineParts.filter((part) => Math.abs(part.x) > 1e-12);
    if (variableParts.length > 1) return null;
    const coefficient = affineParts.filter((part) => Math.abs(part.x) < 1e-12).reduce((total, part) => total * part.c, 1);
    if (variableParts.length === 0) return { x: 0, c: coefficient };
    const variable = variableParts[0]!;
    return { x: coefficient * variable.x, c: coefficient * variable.c };
  }
  if (expression.kind === "div") {
    const numerator = affine(expression.a);
    const denominator = numeric(expression.b);
    return numerator && denominator !== null && Math.abs(denominator) > 1e-12 ? { x: numerator.x / denominator, c: numerator.c / denominator } : null;
  }
  return null;
}

export function simplify(expression: Expr): Expr {
  switch (expression.kind) {
    case "x":
    case "param":
    case "const": return expression;
    case "add": {
      const args = expression.args.map(simplify).flatMap((arg) => arg.kind === "add" ? arg.args : [arg]).filter((arg) => numeric(arg) !== 0);
      const constants = args.map(numeric).filter((value): value is number => value !== null);
      const nonConstants = args.filter((arg) => numeric(arg) === null);
      if (constants.length > 0) nonConstants.push(c(constants.reduce((a, b) => a + b, 0)));
      const grouped = new Map<string, { expression: Expr; count: number }>();
      for (const arg of nonConstants) {
        const key = structuralHash(arg);
        const existing = grouped.get(key);
        if (existing) existing.count += 1;
        else grouped.set(key, { expression: arg, count: 1 });
      }
      const groupedArgs = [...grouped.values()].map(({ expression: arg, count }) => count === 1 ? arg : canonicalize({ kind: "mul", args: [c(count), arg] }));
      const affineParts = groupedArgs.map(affine);
      if (affineParts.length > 0 && affineParts.every((part) => part !== null)) {
        const combined = affineParts.reduce<Affine>((total, part) => ({ x: total.x + (part?.x ?? 0), c: total.c + (part?.c ?? 0) }), { x: 0, c: 0 });
        const combinedTerms: Expr[] = [];
        if (Math.abs(combined.x) > 1e-12) combinedTerms.push(canonicalize({ kind: "mul", args: [c(combined.x), { kind: "x" }] }));
        if (Math.abs(combined.c) > 1e-12) combinedTerms.push(c(combined.c));
        return canonicalize({ kind: "add", args: combinedTerms.length > 0 ? combinedTerms : [c(0)] });
      }
      return canonicalize({ kind: "add", args: groupedArgs });
    }
    case "mul": {
      const args = expression.args.map(simplify).flatMap((arg) => arg.kind === "mul" ? arg.args : [arg]);
      const values = args.map(numeric);
      if (values.some((value) => value !== null && value === 0)) return c(0);
      const constantArgs = args.filter((arg): arg is Extract<Expr, { kind: "const" }> => arg.kind === "const");
      const elementaryConstants = constantArgs.every((arg) => arg.value.kind === "float" || arg.value.kind === "integer");
      const coefficient = values.filter((value): value is number => value !== null).reduce((a, b) => a * b, 1);
      const nonConstants = args.filter((arg) => numeric(arg) === null);
      const addend = nonConstants.find((arg) => arg.kind === "add");
      if (addend && nonConstants.every((arg) => arg === addend || numeric(arg) !== null)) {
        const rest = coefficient;
        return simplify({ kind: "add", args: addend.args.map((arg) => ({ kind: "mul", args: [c(rest), arg] })) });
      }
      if (nonConstants.length === 1 && nonConstants[0]?.kind === "div" && constantArgs.length > 0) {
        const fraction = nonConstants[0];
        return simplify({ kind: "div", a: { kind: "mul", args: [...constantArgs, fraction.a] }, b: fraction.b });
      }
      if (nonConstants.length === 0 && elementaryConstants) return c(coefficient);
      if (!elementaryConstants && constantArgs.length > 0) {
        const symbolic = constantArgs.filter((arg) => arg.value.kind !== "float" && arg.value.kind !== "integer");
        const elementaryProduct = constantArgs.filter((arg) => arg.value.kind === "float" || arg.value.kind === "integer").reduce((total, arg) => total * numeric(arg)!, 1);
        const firstSymbolic = symbolic[0];
        const firstRadicalN = firstSymbolic?.value.kind === "sqrtMultiple"
          ? firstSymbolic.value.n
          : null;
        const sameRadical = firstRadicalN !== null
          && symbolic.length >= 2
          && symbolic.every((arg) => arg.value.kind === "sqrtMultiple" && arg.value.n === firstRadicalN);
        if (sameRadical) {
          nonConstants.push(c(symbolic.reduce((total, arg) => total * numeric(arg)!, elementaryProduct)));
        } else if (symbolic.length === 1 && Math.abs(elementaryProduct - 1) < 1e-12) nonConstants.push(symbolic[0]!);
        else if (symbolic.length === 1 && scaleConstant(symbolic[0]!.value, elementaryProduct)) nonConstants.push(c(scaleConstant(symbolic[0]!.value, elementaryProduct)!));
        else {
          if (Math.abs(elementaryProduct - 1) > 1e-12) nonConstants.push(c(elementaryProduct));
          nonConstants.push(...symbolic);
        }
      } else if (Math.abs(coefficient - 1) > 1e-12) nonConstants.push(c(coefficient));
      const grouped = new Map<string, { expression: Expr; count: number }>();
      for (const arg of nonConstants) {
        const key = structuralHash(arg);
        const existing = grouped.get(key);
        if (existing) existing.count += 1;
        else grouped.set(key, { expression: arg, count: 1 });
      }
      const groupedArgs = [...grouped.values()].map(({ expression: arg, count }) => count === 1 ? arg : { kind: "pow", base: arg, exponent: c(count) } satisfies Expr);
      return canonicalize({ kind: "mul", args: groupedArgs });
    }
    case "div": {
      const numerator = simplify(expression.a);
      const denominator = simplify(expression.b);
      const n = numeric(numerator);
      const d = numeric(denominator);
      if (n !== null && d !== null && Math.abs(d) > 1e-12) return c(n / d);
      if (d === 1) return numerator;
      const numeratorLine = affine(numerator);
      const denominatorLine = affine(denominator);
      if (numeratorLine && denominatorLine && Math.abs(denominatorLine.x) > 1e-12 && (Math.abs(numeratorLine.x) > 1e-12 || Math.abs(Math.abs(denominatorLine.x) - 1) > 1e-9)) {
        const quotient = numeratorLine.x / denominatorLine.x;
        const remainder = (numeratorLine.c - quotient * denominatorLine.c) / denominatorLine.x;
        const shift = denominatorLine.c / denominatorLine.x;
        return simplify({ kind: "add", args: [
          c(quotient),
          { kind: "div", a: c(remainder), b: { kind: "add", args: [{ kind: "x" }, c(shift)] } },
        ] });
      }
      if (n !== null) {
        const line = affine(denominator);
        if (line && Math.abs(line.x) > 1e-12 && Math.abs(Math.abs(line.x) - 1) > 1e-9) {
          const scale = Math.abs(line.x);
          const direction = line.x < 0 ? -1 : 1;
          const normalizedDenominator = canonicalize({ kind: "add", args: [
            canonicalize({ kind: "mul", args: [c(direction), { kind: "x" }] }),
            c(line.c / scale),
          ] });
          return canonicalize({ kind: "div", a: c(n / scale), b: normalizedDenominator });
        }
      }
      return canonicalize({ kind: "div", a: numerator, b: denominator });
    }
    case "pow": {
      const base = simplify(expression.base);
      const exponent = simplify(expression.exponent);
      const power = numeric(exponent);
      if (power === 0) return c(1);
      if (power === 1) return base;
      const baseValue = numeric(base);
      if (baseValue !== null && power !== null) return c(Math.pow(baseValue, power));
      const monomial = power !== null ? monomialPower(base, power) : null;
      if (monomial) return simplify(monomial);
      const expanded = power !== null ? affinePower(base, power) : null;
      if (expanded) return simplify(expanded);
      return canonicalize({ kind: "pow", base, exponent });
    }
    default: {
      const arg = simplify(expression.arg);
      const value = numeric(arg);
      if (value !== null) {
        if (expression.kind === "sin") return c(Math.sin(value));
        if (expression.kind === "cos") return c(Math.cos(value));
        if (expression.kind === "exp") return c(Math.exp(Math.max(-30, Math.min(30, value))));
        if (expression.kind === "log" && value > 0) return c(Math.log(value));
        if (expression.kind === "abs") return c(Math.abs(value));
        if (expression.kind === "sqrt" && value >= 0) return c(Math.sqrt(value));
        if (expression.kind === "tanh") return c(Math.tanh(value));
      }
      if (expression.kind === "abs" && arg.kind === "abs") return arg;
      if (expression.kind === "sqrt" && arg.kind === "pow" && numeric(arg.exponent) === 2) return { kind: "abs", arg: arg.base };
      if (expression.kind === "log") {
        const line = affine(arg);
        if (line && Math.abs(line.x) > 1e-12 && Math.abs(Math.abs(line.x) - 1) > 1e-9) {
          const scale = Math.abs(line.x);
          const direction = line.x < 0 ? -1 : 1;
          const normalizedArg = canonicalize({ kind: "add", args: [
            canonicalize({ kind: "mul", args: [c(direction), { kind: "x" }] }),
            c(line.c / scale),
          ] });
          return simplify({ kind: "add", args: [{ kind: "log", arg: normalizedArg }, c(Math.log(scale))] });
        }
      }
      if (expression.kind === "sin" || expression.kind === "cos") {
        const signed = splitNegative(arg);
        if (signed?.negative) {
          if (expression.kind === "cos") return { kind: "cos", arg: signed.positive };
          return simplify({ kind: "mul", args: [c(-1), { kind: "sin", arg: signed.positive }] });
        }
        const phase = splitPhase(arg);
        if (phase && Math.abs(phase.phase) <= 0.02) return { kind: expression.kind, arg: phase.base };
        if (phase && Math.abs(phase.phase - Math.PI / 2) <= 0.02) {
          return expression.kind === "sin" ? { kind: "cos", arg: phase.base } : simplify({ kind: "mul", args: [c(-1), { kind: "sin", arg: phase.base }] });
        }
        if (phase && Math.abs(Math.abs(phase.phase) - Math.PI) <= 0.02) {
          return simplify({ kind: "mul", args: [c(-1), { kind: expression.kind, arg: phase.base }] });
        }
        if (phase && Math.abs(phase.phase + Math.PI / 2) <= 0.02) {
          return expression.kind === "sin" ? simplify({ kind: "mul", args: [c(-1), { kind: "cos", arg: phase.base }] }) : { kind: "sin", arg: phase.base };
        }
      }
      return { ...expression, arg };
    }
  }
}
