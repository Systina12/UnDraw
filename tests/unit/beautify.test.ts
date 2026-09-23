import {it,expect} from 'vitest';
import {prettyAlternatives} from '../../src/beautify/constants';
import {simplify} from '../../src/expr/simplify';
import {add,mul,integer,variable,type Expr} from '../../src/expr/ast';
it('offers familiar constants for nearby floating-point estimates',()=>{
  expect(prettyAlternatives(3.1412)).toContainEqual({kind:'piMultiple',p:1,q:1});
  expect(prettyAlternatives(.6668)).toContainEqual({kind:'rational',p:2,q:3});
  expect(prettyAlternatives(1.999)).toContainEqual({kind:'integer',value:2});
});
it('simplification preserves π and exact integer coefficient nodes',()=>{
  const pi:Expr={kind:'const',value:{kind:'piMultiple',p:1,q:1}};
  const arg=simplify(add(mul(pi,variable()),integer(0)));
  expect(JSON.stringify(arg)).toContain('piMultiple');
  expect(JSON.stringify(simplify(mul(pi,variable())))).toContain('piMultiple');
});
