import {describe,it,expect} from 'vitest';
import {add,mul,pow,integer,variable,constant,type Expr} from '../../src/expr/ast';
import {simplify} from '../../src/expr/simplify';
import {canonicalize,structuralHash} from '../../src/expr/canonical';
import {substituteVariable} from '../../src/expr/substitute';
import {evaluate} from '../../src/expr/evaluate';

const x=variable();
describe('canonical expression rewriting',()=>{
  it('is commutative and idempotent',()=>{
    expect(structuralHash(canonicalize(add(x,integer(1))))).toBe(structuralHash(canonicalize(add(integer(1),x))));
    const a=canonicalize(mul(add(x,integer(0)),x));
    expect(canonicalize(a)).toEqual(a);
    expect(simplify(mul(x,x))).toEqual(pow(x,integer(2)));
  });
  it('keeps simplifications numerically correct on negative inputs',()=>{
    const expr:Expr={kind:'sqrt',arg:pow(x,integer(2))};
    expect(evaluate(simplify(expr),-3).value).toBe(3);
    expect(simplify({kind:'exp',arg:{kind:'log',arg:x}})).toEqual({kind:'exp',arg:{kind:'log',arg:x}});
    expect(evaluate(simplify(add(mul(integer(2),x),mul(integer(3),x))),4).value).toBe(20);
  });
  it('substitutes only the named variable and preserves other variables',()=>{
    const result=substituteVariable(add(x,variable('t')),'x',add(x,constant(2)));
    expect(evaluate(result,3).value).toBe(8);
    expect(structuralHash(result)).toContain('"t"');
  });
});
