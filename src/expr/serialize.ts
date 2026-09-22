import type { Constant, Expr } from "../core/types";

export function serializeExpr(expression: Expr): string {
  return JSON.stringify(expression);
}

export function deserializeExpr(serialized: string): Expr {
  const parsed: unknown = JSON.parse(serialized);
  if (!isExpr(parsed)) throw new Error("Invalid expression payload");
  return parsed;
}

function isExpr(value: unknown): value is Expr {
  if (!isRecord(value)) return false;
  const kind = value.kind;
  if (typeof kind !== "string") return false;
  switch (kind) {
    case "x": return true;
    case "param": return Number.isInteger(value.index) && (value.index as number) >= 0;
    case "const": return isConstant(value.value);
    case "add":
    case "mul": return Array.isArray(value.args) && value.args.length > 0 && value.args.every(isExpr);
    case "div": return isExpr(value.a) && isExpr(value.b);
    case "pow": return isExpr(value.base) && isExpr(value.exponent);
    case "sin":
    case "cos":
    case "exp":
    case "log":
    case "abs":
    case "sqrt":
    case "tanh": return isExpr(value.arg);
    default: return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isConstant(value: unknown): value is Constant {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "float": return isFiniteNumber(value.value);
    case "integer": return isFiniteNumber(value.value) && Number.isInteger(value.value);
    case "rational":
    case "piMultiple":
    case "eMultiple": return Number.isInteger(value.p) && Number.isInteger(value.q) && value.q !== 0;
    case "sqrtMultiple": return Number.isInteger(value.p) && Number.isInteger(value.q) && value.q !== 0 && Number.isInteger(value.n) && (value.n as number) >= 0;
    default: return false;
  }
}
