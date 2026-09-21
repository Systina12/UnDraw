import type { Expr, Normalization } from "../core/types";
import { add, c, mul } from "./ast";
import { simplify } from "./simplify";

function replaceNormalizedX(expression: Expr, normalizedX: Expr): Expr {
  switch (expression.kind) {
    case "x": return normalizedX;
    case "param":
    case "const": return expression;
    case "add": return add(expression.args.map((arg) => replaceNormalizedX(arg, normalizedX)));
    case "mul": return mul(expression.args.map((arg) => replaceNormalizedX(arg, normalizedX)));
    case "div": return { kind: "div", a: replaceNormalizedX(expression.a, normalizedX), b: replaceNormalizedX(expression.b, normalizedX) };
    case "pow": return { kind: "pow", base: replaceNormalizedX(expression.base, normalizedX), exponent: replaceNormalizedX(expression.exponent, normalizedX) };
    default: return { ...expression, arg: replaceNormalizedX(expression.arg, normalizedX) };
  }
}

export function normalizedToWorld(expression: Expr, normalization: Normalization): Expr {
  const normalizedX = mul(c(1 / normalization.xs), add([c(-normalization.xc), { kind: "x" }]));
  const transformed = replaceNormalizedX(expression, normalizedX);
  return simplify(add([c(normalization.yc), mul([c(normalization.ys), transformed])]));
}
