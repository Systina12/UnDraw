import type { Expr } from "../core/types";
import { c, constantValue } from "./ast";
import { canonicalize, structuralHash } from "./canonical";

function numeric(expression: Expr): number | null {
  if (expression.kind !== "const") return null;
  return constantValue(expression.value);
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
      if (nonConstants.length === 0 && elementaryConstants) return c(coefficient);
      if (!elementaryConstants && constantArgs.length > 0) {
        const symbolic = constantArgs.find((arg) => arg.value.kind !== "float" && arg.value.kind !== "integer");
        const elementaryProduct = constantArgs.filter((arg) => arg.value.kind === "float" || arg.value.kind === "integer").reduce((total, arg) => total * numeric(arg)!, 1);
        if (symbolic && Math.abs(elementaryProduct - 1) < 1e-12) nonConstants.push(symbolic);
        else if (symbolic && scaleConstant(symbolic.value, elementaryProduct)) nonConstants.push(c(scaleConstant(symbolic.value, elementaryProduct)!));
        else nonConstants.push(...constantArgs);
      } else if (Math.abs(coefficient - 1) > 1e-12) nonConstants.push(c(coefficient));
      return canonicalize({ kind: "mul", args: nonConstants });
    }
    case "div": {
      const numerator = simplify(expression.a);
      const denominator = simplify(expression.b);
      const n = numeric(numerator);
      const d = numeric(denominator);
      if (n !== null && d !== null && Math.abs(d) > 1e-12) return c(n / d);
      if (d === 1) return numerator;
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
      return { ...expression, arg };
    }
  }
}
