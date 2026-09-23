import { describe, expect, it } from "vitest";
import { c, div, exprToLatex, exprToPlain, evaluateExpr, x, add, mul, pow, sin, cos } from "../src/expr/ast";
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

  it("renders signed terms and simplifies monomial powers", () => {
    const expression = simplify(add([
      pow(mul(c(0.5), x()), c(3)),
      mul(c(-1), x()),
    ]));
    const plain = exprToPlain(expression);
    expect(plain).toContain("x^3");
    expect(plain).toContain(" - x");
    expect(plain).not.toContain("+ -");
    expect(evaluateExpr(expression, 2)).toBeCloseTo(-1);
  });

  it("normalizes affine logarithms and linear rational fractions", () => {
    const logarithm = simplify({ kind: "log", arg: add([c(2), mul(c(0.5), x())]) });
    const fraction = simplify(div(c(2), add([c(4), mul(c(2), x())])));
    expect(exprToPlain(logarithm)).toContain("log");
    expect(exprToPlain(logarithm)).toContain("4 + x");
    expect(exprToPlain(fraction)).toContain("1/");
    expect(evaluateExpr(fraction, 0)).toBeCloseTo(0.5);
  });

  it("renders fraction grouping only once", () => {
    const expression = div(c(1), add([c(2), x()]));
    expect(exprToPlain(expression)).toBe("1/(2 + x)");
  });

  it("preserves denominator multiplication grouping in plain expressions", () => {
    const expression = div(c(1), mul(c(2), x()));
    expect(exprToPlain(expression)).toBe("1/(2*x)");
  });

  it("preserves a powered base when rendering nested powers", () => {
    const expression = pow(pow(x(), c(2)), c(3));
    expect(exprToPlain(expression)).toBe("(x^2)^3");
    expect(exprToLatex(expression)).toBe("\\left(x^{2}\\right)^{3}");
  });

  it("groups a negative constant used as a power base", () => {
    const expression = pow(c(-2), c(2));
    expect(exprToPlain(expression)).toBe("(-2)^2");
    expect(exprToLatex(expression)).toBe("\\left(-2\\right)^{2}");
  });

  it("groups compound symbolic constants in powers and plain denominators", () => {
    const poweredPiMultiple = pow(c({ kind: "piMultiple", p: 2, q: 1 }), c(2));
    const rationalDenominator = div(c(1), c({ kind: "rational", p: 2, q: 3 }));
    const piDenominator = div(c(1), c({ kind: "piMultiple", p: 2, q: 1 }));
    expect(exprToPlain(poweredPiMultiple)).toBe("(2π)^2");
    expect(exprToLatex(poweredPiMultiple)).toBe("\\left(2\\pi\\right)^{2}");
    expect(exprToPlain(rationalDenominator)).toBe("1/(2/3)");
    expect(exprToLatex(rationalDenominator)).toBe("\\frac{1}{\\frac{2}{3}}");
    expect(exprToPlain(piDenominator)).toBe("1/(2π)");
  });

  it("normalizes fitted trigonometric phases near a human-friendly angle", () => {
    const expression = simplify(mul(c(-3), cos(add([c(-3.15662), mul(c(6.31325), x())]))));
    expect(exprToPlain(expression)).toContain("cos");
    expect(exprToPlain(expression)).toMatch(/3.*cos/);
    expect(evaluateExpr(expression, 0.2)).toBeCloseTo(3 * Math.cos(6.31325 * 0.2), 10);
  });

  it("rejects invalid domains without throwing", () => {
    expect(evaluateExpr({ kind: "log", arg: c(-1) }, 0)).toBeNull();
    expect(evaluateExpr({ kind: "div", a: c(1), b: c(0) }, 0)).toBeNull();
  });
});
