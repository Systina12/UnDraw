import {it,expect} from 'vitest';
import {prettyAlternatives} from '../../src/beautify/constants';
import {simplify} from '../../src/expr/simplify';
import {add,mul,integer,variable,type Expr} from '../../src/expr/ast';
import {constantCost} from '../../src/search/scoring';
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
it('charges the rational coefficient of a radical instead of treating it as a simple constant',()=>{
  const pi=constantCost({kind:'piMultiple',p:1,q:1});
  const radical=constantCost({kind:'sqrtMultiple',p:20,q:9,n:2});
  expect(radical).toBeGreaterThan(pi+1);
});
it('charges the numerator and denominator of an e multiple',()=>{
  expect(constantCost({kind:'eMultiple',p:1,q:12}))
    .toBeGreaterThan(constantCost({kind:'rational',p:1,q:4}));
  expect(constantCost({kind:'eMultiple',p:1,q:12}))
    .toBeGreaterThan(constantCost({kind:'eMultiple',p:1,q:1}));
});
it('charges large numeric literals by their written magnitude',()=>{
  expect(constantCost({kind:'float',value:1e9}))
    .toBeGreaterThan(constantCost({kind:'float',value:11})+3);
});
