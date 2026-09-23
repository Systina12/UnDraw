import {it,expect} from 'vitest';
import {semanticSignature} from '../../src/search/semanticHash';
import {add,mul,integer,variable} from '../../src/expr/ast';
it('merges affine-equivalent probes but rejects invalid domains',()=>{
  const x=variable();
  expect(semanticSignature(add(x,x))).toBe(semanticSignature(mul(integer(2),x)));
  expect(semanticSignature({kind:'log',arg:x})).toBeNull();
});
