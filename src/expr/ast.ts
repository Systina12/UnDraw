import type { Constant, Expr } from "../core/types";
import { canonicalize, complexity } from "./canonical";

export const x = (): Expr => ({ kind: "x" });
export const param = (index: number): Expr => ({ kind: "param", index });

export function c(value: number | Constant): Expr {
  if (typeof value === "number") {
    return { kind: "const", value: Number.isInteger(value) ? { kind: "integer", value } : { kind: "float", value } };
  }
  return { kind: "const", value };
}

export const add = (args: Expr[] | Expr, ...rest: Expr[]): Expr => canonicalize({ kind: "add", args: Array.isArray(args) ? args : [args, ...rest] });
export const mul = (args: Expr[] | Expr, ...rest: Expr[]): Expr => canonicalize({ kind: "mul", args: Array.isArray(args) ? args : [args, ...rest] });
export const div = (a: Expr, b: Expr): Expr => canonicalize({ kind: "div", a, b });
export const pow = (base: Expr, exponent: Expr): Expr => canonicalize({ kind: "pow", base, exponent });
export const sin = (arg: Expr): Expr => ({ kind: "sin", arg });
export const cos = (arg: Expr): Expr => ({ kind: "cos", arg });
export const exp = (arg: Expr): Expr => ({ kind: "exp", arg });
export const log = (arg: Expr): Expr => ({ kind: "log", arg });
export const abs = (arg: Expr): Expr => ({ kind: "abs", arg });
export const sqrt = (arg: Expr): Expr => ({ kind: "sqrt", arg });
export const tanh = (arg: Expr): Expr => ({ kind: "tanh", arg });

export function constantValue(constant: Constant): number {
  switch (constant.kind) {
    case "float":
    case "integer": return constant.value;
    case "rational": return constant.p / constant.q;
    case "piMultiple": return (constant.p / constant.q) * Math.PI;
    case "eMultiple": return (constant.p / constant.q) * Math.E;
    case "sqrtMultiple": return (constant.p / constant.q) * Math.sqrt(constant.n);
  }
}

function safeNumber(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export function evaluateExpr(expression: Expr, input: number, params: readonly number[] = []): number | null {
  switch (expression.kind) {
    case "x": return safeNumber(input);
    case "param": return safeNumber(params[expression.index] ?? NaN);
    case "const": return safeNumber(constantValue(expression.value));
    case "add": {
      let total = 0;
      for (const arg of expression.args) {
        const value = evaluateExpr(arg, input, params);
        if (value === null) return null;
        total += value;
      }
      return safeNumber(total);
    }
    case "mul": {
      let total = 1;
      for (const arg of expression.args) {
        const value = evaluateExpr(arg, input, params);
        if (value === null) return null;
        total *= value;
      }
      return safeNumber(total);
    }
    case "div": {
      const numerator = evaluateExpr(expression.a, input, params);
      const denominator = evaluateExpr(expression.b, input, params);
      if (numerator === null || denominator === null || Math.abs(denominator) < 1e-10) return null;
      return safeNumber(numerator / denominator);
    }
    case "pow": {
      const base = evaluateExpr(expression.base, input, params);
      const exponent = evaluateExpr(expression.exponent, input, params);
      if (base === null || exponent === null) return null;
      return safeNumber(Math.pow(base, exponent));
    }
    case "sin": return safeNumber(Math.sin(evaluateExpr(expression.arg, input, params) ?? NaN));
    case "cos": return safeNumber(Math.cos(evaluateExpr(expression.arg, input, params) ?? NaN));
    case "exp": {
      const value = evaluateExpr(expression.arg, input, params);
      return value === null ? null : safeNumber(Math.exp(Math.max(-30, Math.min(30, value))));
    }
    case "log": {
      const value = evaluateExpr(expression.arg, input, params);
      return value === null || value <= 0 ? null : safeNumber(Math.log(value));
    }
    case "abs": return safeNumber(Math.abs(evaluateExpr(expression.arg, input, params) ?? NaN));
    case "sqrt": {
      const value = evaluateExpr(expression.arg, input, params);
      return value === null || value < 0 ? null : safeNumber(Math.sqrt(value));
    }
    case "tanh": return safeNumber(Math.tanh(evaluateExpr(expression.arg, input, params) ?? NaN));
  }
}

function numberText(value: number): string {
  if (Math.abs(value) < 1e-10) return "0";
  if (Number.isInteger(value)) return String(value);
  return Number(value.toPrecision(6)).toString();
}

function constantLatex(constant: Constant): string {
  switch (constant.kind) {
    case "float":
    case "integer": return numberText(constant.value);
    case "rational": return constant.q === 1 ? String(constant.p) : `\\frac{${constant.p}}{${constant.q}}`;
    case "piMultiple": {
      if (constant.p === 0) return "0";
      const sign = constant.p < 0 ? "-" : "";
      const magnitude = Math.abs(constant.p);
      const numerator = magnitude === 1 ? "" : String(magnitude);
      return constant.q === 1 ? `${sign}${numerator}\\pi` : `\\frac{${sign}${numerator}\\pi}{${constant.q}}`;
    }
    case "eMultiple": {
      if (constant.p === 0) return "0";
      const sign = constant.p < 0 ? "-" : "";
      const magnitude = Math.abs(constant.p);
      const numerator = magnitude === 1 ? "" : String(magnitude);
      return constant.q === 1 ? `${sign}${numerator}e` : `\\frac{${sign}${numerator}e}{${constant.q}}`;
    }
    case "sqrtMultiple": {
      if (constant.p === 0) return "0";
      const sign = constant.p < 0 ? "-" : "";
      const magnitude = Math.abs(constant.p);
      const numerator = magnitude === 1 ? "" : String(magnitude);
      const root = `\\sqrt{${constant.n}}`;
      return constant.q === 1 ? `${sign}${numerator}${root}` : `\\frac{${sign}${numerator}${root}}{${constant.q}}`;
    }
  }
}

function constantPlain(constant: Constant): string {
  switch (constant.kind) {
    case "float":
    case "integer": return numberText(constant.value);
    case "rational": return constant.q === 1 ? String(constant.p) : `${constant.p}/${constant.q}`;
    case "piMultiple": {
      if (constant.p === 0) return "0";
      const sign = constant.p < 0 ? "-" : "";
      const magnitude = Math.abs(constant.p);
      return constant.q === 1 ? `${sign}${magnitude === 1 ? "" : magnitude}π` : `${sign}${magnitude === 1 ? "" : magnitude}π/${constant.q}`;
    }
    case "eMultiple": {
      if (constant.p === 0) return "0";
      const sign = constant.p < 0 ? "-" : "";
      const magnitude = Math.abs(constant.p);
      return constant.q === 1 ? `${sign}${magnitude === 1 ? "" : magnitude}e` : `${sign}${magnitude === 1 ? "" : magnitude}e/${constant.q}`;
    }
    case "sqrtMultiple": {
      if (constant.p === 0) return "0";
      const sign = constant.p < 0 ? "-" : "";
      const magnitude = Math.abs(constant.p);
      return constant.q === 1 ? `${sign}${magnitude === 1 ? "" : magnitude}√${constant.n}` : `${sign}${magnitude === 1 ? "" : magnitude}√${constant.n}/${constant.q}`;
    }
  }
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

function positiveTerm(expression: Expr): Expr | null {
  if (expression.kind === "const" && constantValue(expression.value) < -1e-12) return c(negateConstant(expression.value));
  if (expression.kind !== "mul") return null;
  const numericFactors = expression.args
    .map((arg, index) => ({ arg, index, value: arg.kind === "const" ? constantValue(arg.value) : null }))
    .filter((item): item is { arg: Extract<Expr, { kind: "const" }>; index: number; value: number } => item.value !== null);
  const product = numericFactors.reduce((total, item) => total * item.value, 1);
  if (product >= -1e-12) return null;
  const signIndex = numericFactors.find((item) => item.value < -1e-12)?.index;
  if (signIndex === undefined) return null;
  return canonicalize({
    kind: "mul",
    args: expression.args.map((arg, index) => index === signIndex && arg.kind === "const" ? c(negateConstant(arg.value)) : arg),
  });
}

function precedence(expression: Expr): number {
  if (expression.kind === "add") return 1;
  if (expression.kind === "mul" || expression.kind === "div") return 2;
  if (expression.kind === "pow") return 3;
  if (expression.kind === "const") {
    if (constantValue(expression.value) < 0) return 3;
    switch (expression.value.kind) {
      case "rational": return expression.value.q === 1 ? 4 : 2;
      case "piMultiple":
      case "eMultiple": return expression.value.q === 1 && Math.abs(expression.value.p) === 1 ? 4 : 2;
      case "sqrtMultiple": return 2;
      case "float":
      case "integer": return 4;
    }
  }
  return 4;
}

function render(expression: Expr, latex: boolean, parentPrecedence = 0, variable = "x"): string {
  const child = (value: Expr, parent: number) => render(value, latex, parent, variable);
  let result: string;
  switch (expression.kind) {
    case "x": result = variable; break;
    case "param": result = latex ? `\\theta_${expression.index + 1}` : `θ${expression.index + 1}`; break;
    case "const": result = latex ? constantLatex(expression.value) : constantPlain(expression.value); break;
    case "add": {
      result = expression.args.map((arg, index) => {
        const positive = positiveTerm(arg);
        const negative = positive !== null;
        const term = render(positive ?? arg, latex, 1, variable);
        if (index === 0) return negative ? `-${term}` : term;
        return negative ? ` - ${term}` : ` + ${term}`;
      }).join("");
      break;
    }
    case "mul": result = expression.args.map((arg) => child(arg, 2)).join(latex ? " \\, " : "*"); break;
    case "div": result = latex ? `\\frac{${render(expression.a, true, 0, variable)}}{${render(expression.b, true, 0, variable)}}` : `${child(expression.a, 2)}/${child(expression.b, 3)}`; break;
    case "pow": result = latex ? `${child(expression.base, 4)}^{${render(expression.exponent, true, 0, variable)}}` : `${child(expression.base, 4)}^${child(expression.exponent, 3)}`; break;
    case "sin": result = latex ? `\\sin\\left(${render(expression.arg, true, 0, variable)}\\right)` : `sin(${render(expression.arg, false, 0, variable)})`; break;
    case "cos": result = latex ? `\\cos\\left(${render(expression.arg, true, 0, variable)}\\right)` : `cos(${render(expression.arg, false, 0, variable)})`; break;
    case "exp": result = latex ? `e^{${render(expression.arg, true, 0, variable)}}` : `exp(${render(expression.arg, false, 0, variable)})`; break;
    case "log": result = latex ? `\\log\\left(${render(expression.arg, true, 0, variable)}\\right)` : `log(${render(expression.arg, false, 0, variable)})`; break;
    case "abs": result = latex ? `\\left|${render(expression.arg, true, 0, variable)}\\right|` : `abs(${render(expression.arg, false, 0, variable)})`; break;
    case "sqrt": result = latex ? `\\sqrt{${render(expression.arg, true, 0, variable)}}` : `sqrt(${render(expression.arg, false, 0, variable)})`; break;
    case "tanh": result = latex ? `\\tanh\\left(${render(expression.arg, true, 0, variable)}\\right)` : `tanh(${render(expression.arg, false, 0, variable)})`; break;
  }
  return precedence(expression) < parentPrecedence ? (latex ? `\\left(${result!}\\right)` : `(${result!})`) : result!;
}

export function exprToLatex(expression: Expr, variable = "x"): string {
  return render(expression, true, 0, variable);
}

export function exprToPlain(expression: Expr, variable = "x"): string {
  return render(expression, false, 0, variable);
}

export { canonicalize, complexity };
