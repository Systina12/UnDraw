import {it,expect} from 'vitest';
import {solveCurve} from '../../src/core/solver';
import {makeStroke} from '../fixtures/generateStroke';
it('chooses a concise pi-based sinusoid',()=>{
  const result=solveCurve(makeStroke(x=>2*Math.sin(Math.PI*x),{min:-1,max:1,noise:.012,seed:7}));
  expect(result.balanced.latex).toContain('\\pi');
  expect(result.balanced.rmse).toBeLessThan(.04);
  expect(result.balanced.complexity).toBeLessThan(12);
});
