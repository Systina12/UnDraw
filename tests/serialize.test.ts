import { describe, expect, it } from "vitest";
import { deserializeExpr, serializeExpr } from "../src/expr/serialize";
import { c, evaluateExpr, sin, x } from "../src/expr/ast";

describe("expression serialization", () => {
  it("round-trips valid ASTs", () => {
    const expression = sin(c({ kind: "piMultiple", p: 1, q: 1 }));
    expect(deserializeExpr(serializeExpr(expression))).toEqual(expression);
  });

  it("rejects malformed nested expressions", () => {
    expect(() => deserializeExpr(JSON.stringify({ kind: "sin", arg: { kind: "div", a: x() } }))).toThrow(/invalid/i);
    expect(() => deserializeExpr(JSON.stringify({ kind: "const", value: { kind: "rational", p: 1, q: 0 } }))).toThrow(/invalid/i);
  });

  it("keeps non-finite evaluation out of the AST API", () => {
    expect(evaluateExpr(x(), Number.NaN)).toBeNull();
    expect(() => deserializeExpr(JSON.stringify(c(Number.NaN)))).toThrow(/invalid/i);
  });
});
