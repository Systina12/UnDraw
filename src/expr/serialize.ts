import type { Constant, Expr } from "../core/types";
import { constantValue } from "./ast";

export function serializeExpr(expression: Expr): string {
  if (!isExpr(expression)) throw new Error("Invalid expression payload");
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
  let fieldsValid = false;
  switch (value.kind) {
    case "float": fieldsValid = isFiniteNumber(value.value); break;
    case "integer": fieldsValid = Number.isSafeInteger(value.value); break;
    case "rational":
    case "piMultiple":
    case "eMultiple": fieldsValid = Number.isSafeInteger(value.p) && Number.isSafeInteger(value.q) && value.q !== 0; break;
    case "sqrtMultiple": fieldsValid = Number.isSafeInteger(value.p) && Number.isSafeInteger(value.q) && value.q !== 0 && Number.isSafeInteger(value.n) && (value.n as number) >= 0; break;
    default: return false;
  }
  if (!fieldsValid) return false;
  const numericValue = constantValue(value as unknown as Constant);
  return Number.isFinite(numericValue) && Math.abs(numericValue) <= Number.MAX_SAFE_INTEGER;
}
