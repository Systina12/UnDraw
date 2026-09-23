import {it,expect} from 'vitest';
import {enumerateGrammar,templateHash,parameterizeShape,countParams,fitTemplate} from '../../src/search/grammar';
import {preprocess} from '../../src/core/preprocess';
import {makeStroke} from '../fixtures/generateStroke';
import type {TemplateExpr} from '../../src/expr/template';

const x:TemplateExpr={kind:'var',name:'x'};
it('generates bounded nonredundant symbolic shapes and an affine sine family',()=>{
  const byLevel=new Map<number,TemplateExpr[]>([[0,[x]]]);
  const level1=enumerateGrammar(1,byLevel);byLevel.set(1,level1);
  const level2=enumerateGrammar(2,byLevel);
  expect(level2.some(t=>templateHash(t).includes('sin'))).toBe(true);
  const sine=parameterizeShape({kind:'sin',arg:x});
  expect(countParams(sine)).toBe(4);
  expect(new Set(level1.map(templateHash)).size).toBe(level1.length);
});
it('fits a chirp shape using at most four adjustable coefficients',()=>{
  const prepared=preprocess(makeStroke(x=>Math.sin(x*x),{min:-2,max:2,noise:.005,seed:17}));
  if(prepared.mode!=='function')throw Error('Expected function');
  const shape:TemplateExpr={kind:'sin',arg:{kind:'pow',base:x,exponent:{kind:'const',value:{kind:'integer',value:2}}}};
  const result=fitTemplate(parameterizeShape(shape),prepared.data);
  expect(result).not.toBeNull();
  expect(result!.modelFamily).toBe('symbolic');
});
