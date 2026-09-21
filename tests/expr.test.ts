import { describe, expect, it } from "vitest";
import { c, exprToLatex, exprToPlain, evaluateExpr, x, add, mul, sin } from "../src/expr/ast";
import { simplify } from "../src/expr/simplify";

describe("expression AST", () => {
  it("evaluates safe arithmetic and renders readable LaTeX", () => {
    const expression = mul(c(2), sin(mul(c({ kind: "piMultiple", p: 1, q: 1 }), x())));
    expect(evaluateExpr(expression, 0.5)).toBeCloseTo(2);
    expect(exprToLatex(expression)).toContain("\\sin");
    expect(exprToPlain(expression)).toContain("sin");
  });

  it("canonicalizes neutral elements and repeated terms", () => {
    const expression = add([x(), c(0), x()]);
    const simplified = simplify(expression);
    expect(exprToPlain(simplified)).toMatch(/2.*x|x.*2/);
    expect(evaluateExpr(simplified, 3)).toBeCloseTo(6);
  });

  it("rejects invalid domains without throwing", () => {
    expect(evaluateExpr({ kind: "log", arg: c(-1) }, 0)).toBeNull();
    expect(evaluateExpr({ kind: "div", a: c(1), b: c(0) }, 0)).toBeNull();
  });
});
