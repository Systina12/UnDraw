import type { Expr } from "../core/types";

export function serializeExpr(expression: Expr): string {
  return JSON.stringify(expression);
}

export function deserializeExpr(serialized: string): Expr {
  const parsed: unknown = JSON.parse(serialized);
  if (!isExpr(parsed)) throw new Error("Invalid expression payload");
  return parsed;
}

function isExpr(value: unknown): value is Expr {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === "string" && ["x", "param", "const", "add", "mul", "div", "pow", "sin", "cos", "exp", "log", "abs", "sqrt", "tanh"].includes(kind);
}
