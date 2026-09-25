import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/expr/evaluate';
import { toPlain } from '../../src/expr/plain';
import { toLatex } from '../../src/expr/latex';
import { serializeExpr, deserializeExpr } from '../../src/expr/serialize';
import type { Expr } from '../../src/expr/ast';
import {simplify} from '../../src/expr/simplify';
import {polynomialExpr} from '../../src/expr/polynomial';

describe('expression tree', () => {
  const x: Expr = {kind:'var',name:'x'};
  it('preserves a small polynomial coefficient when its value matters over the domain',()=>{
    const coefficients=Array(9).fill(0) as number[];
    coefficients[8]=1e-12;
    const expression=polynomialExpr(coefficients);
    expect(evaluate(expression,5).value).toBeCloseTo(5**8*1e-12,13);
    expect(evaluate(simplify(expression,[-5,5]),5).value).toBeCloseTo(5**8*1e-12,13);
  });
  it('collapses normalized powers, outer offsets and exact quarter-turn phases',()=>{
    const halfPi:Expr={kind:'const',value:{kind:'piMultiple',p:-1,q:2}};
    const expression:Expr={kind:'add',args:[{kind:'const',value:{kind:'float',value:.25}},
      {kind:'mul',args:[{kind:'const',value:{kind:'float',value:.5}},
        {kind:'add',args:[{kind:'const',value:{kind:'float',value:-.5}},
          {kind:'cos',arg:{kind:'add',args:[halfPi,
            {kind:'mul',args:[{kind:'const',value:{kind:'float',value:4}},
              {kind:'pow',base:{kind:'mul',args:[{kind:'const',value:{kind:'float',value:.5}},x]},
                exponent:{kind:'const',value:{kind:'integer',value:2}}}]},
          ]}}]}]}]};
    const clean=simplify(expression,[-2,2]);
    expect(toPlain(clean)).toContain('sin(');
    expect(toPlain(clean)).not.toContain('cos(');
    expect(toPlain(clean)).not.toContain(' + ');
    for(const sample of [-2,-1,.3,1.6])expect(evaluate(clean,sample).value)
      .toBeCloseTo(evaluate(expression,sample).value,12);
  });
  it('evaluates a mathematical constant and renders understandable formats', () => {
    const expr: Expr = {kind:'sin',arg:{kind:'mul',args:[{kind:'const',value:{kind:'piMultiple',p:1,q:1}},x]}};
    expect(evaluate(expr,.5)).toEqual({value:1,valid:true});
    expect(toLatex(expr)).toContain('\\pi');
    expect(toPlain(expr)).toContain('pi');
    expect(deserializeExpr(serializeExpr(expr))).toEqual(expr);
  });
  it('rejects invalid domains and supports both variables', () => {
    const constant = (value: number): Expr => ({kind:'const',value:{kind:'float',value}});
    expect(evaluate({kind:'log',arg:constant(-1)},0).valid).toBe(false);
    expect(evaluate({kind:'div',a:x,b:constant(0)},1).valid).toBe(false);
    expect(evaluate({kind:'sqrt',arg:constant(-2)},1).valid).toBe(false);
    expect(evaluate({kind:'pow',base:constant(-2),exponent:constant(.5)},1).valid).toBe(false);
    expect(evaluate({kind:'var',name:'t'},.7).value).toBe(.7);
    expect(evaluate({kind:'exp',arg:constant(100)},0).valid).toBe(false);
  });
  it('validates serialized data instead of trusting JSON', () => {
    expect(() => deserializeExpr('{"kind":"const","value":{"kind":"float","value":1e999}}')).toThrow();
    expect(() => deserializeExpr('{"kind":"system","command":"danger"}')).toThrow();
  });
  it('parenthesizes nested arithmetic and renders all constant families', () => {
    const expr: Expr = {kind:'div',a:{kind:'add',args:[x,{kind:'const',value:{kind:'integer',value:1}}]},b:{kind:'const',value:{kind:'sqrtMultiple',p:1,q:2,n:2}}};
    expect(toPlain(expr)).toContain('(x + 1)');
    expect(toLatex(expr)).toContain('\\sqrt{2}');
    expect(evaluate(expr,1).value).toBeCloseTo(2 * Math.sqrt(2));
  });
});
