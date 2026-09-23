import {it,expect} from 'vitest';
import {preprocess} from '../../src/core/preprocess';
import {extractFeatures,prioritizeModels} from '../../src/core/features';
import {makeStroke} from '../fixtures/generateStroke';

function features(f:(x:number)=>number){
  const prepared=preprocess(makeStroke(f,{min:-2,max:2,noise:.001,count:256}));
  if(prepared.mode!=='function')throw Error('Function expected');
  return extractFeatures(prepared.data);
}
it('uses shape clues for ordering without excluding model families',()=>{
  expect(features(x=>Math.abs(x-1)).cusp).toBeGreaterThan(.5);
  expect(prioritizeModels(features(Math.sin))[0]).toMatch(/sin|fourier/);
  expect(prioritizeModels(features(x=>x*x))).toContain('exponential');
});
