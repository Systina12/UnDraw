import type { Expr } from "../core/types";
import { constantValue } from "./ast";

export function structuralHash(expression: Expr): string {
  switch (expression.kind) {
    case "x": return "x";
    case "param": return `p${expression.index}`;
    case "const": return `c:${expression.value.kind}:${JSON.stringify(expression.value)}`;
    case "add": return `add(${expression.args.map(structuralHash).sort().join(",")})`;
    case "mul": return `mul(${expression.args.map(structuralHash).sort().join(",")})`;
    case "div": return `div(${structuralHash(expression.a)},${structuralHash(expression.b)})`;
    case "pow": return `pow(${structuralHash(expression.base)},${structuralHash(expression.exponent)})`;
    default: return `${expression.kind}(${structuralHash(expression.arg)})`;
  }
}

export function complexity(expression: Expr): number {
  switch (expression.kind) {
    case "x": return 0;
    case "param": return 1;
    case "const": return expression.value.kind === "float" ? 1 : 0.5;
    case "add": return 1 + expression.args.reduce((total, arg) => total + complexity(arg), 0);
    case "mul": return 1 + expression.args.reduce((total, arg) => total + complexity(arg), 0);
    case "div": return 2 + complexity(expression.a) + complexity(expression.b);
    case "pow": return 1 + complexity(expression.base) + complexity(expression.exponent);
    case "abs": return 1 + complexity(expression.arg);
    case "sqrt": return 2 + complexity(expression.arg);
    case "sin":
    case "cos": return 2 + complexity(expression.arg);
    case "exp":
    case "log":
    case "tanh": return 3 + complexity(expression.arg);
  }
}

function isConstant(expression: Expr): expression is Extract<Expr, { kind: "const" }> {
  return expression.kind === "const";
}

function isZero(expression: Expr): boolean {
  return isConstant(expression) && Math.abs(constantValue(expression.value)) < 1e-12;
}

function isOne(expression: Expr): boolean {
  return isConstant(expression) && Math.abs(constantValue(expression.value) - 1) < 1e-12;
}

export function canonicalize(expression: Expr): Expr {
  if (expression.kind === "add" || expression.kind === "mul") {
    const flattened = expression.args.flatMap((arg) => {
      const child = canonicalize(arg);
      return child.kind === expression.kind ? child.args : [child];
    });
    const filtered = expression.kind === "add" ? flattened.filter((arg) => !isZero(arg)) : flattened.filter((arg) => !isOne(arg));
    if (expression.kind === "mul" && filtered.some(isZero)) return { kind: "const", value: { kind: "integer", value: 0 } };
    if (filtered.length === 0) return { kind: "const", value: { kind: "integer", value: expression.kind === "add" ? 0 : 1 } };
    if (filtered.length === 1) return filtered[0]!;
    return { kind: expression.kind, args: filtered.sort((a, b) => structuralHash(a).localeCompare(structuralHash(b))) };
  }
  if (expression.kind === "div") return { kind: "div", a: canonicalize(expression.a), b: canonicalize(expression.b) };
  if (expression.kind === "pow") return { kind: "pow", base: canonicalize(expression.base), exponent: canonicalize(expression.exponent) };
  if (expression.kind !== "x" && expression.kind !== "param" && expression.kind !== "const") return { ...expression, arg: canonicalize(expression.arg) };
  return expression;
}
