import {expect,it} from 'vitest';
import {solveCurveProgressive} from '../../src/core/progressive';
import {makeStroke} from '../fixtures/generateStroke';

it('emits a fast usable result then finalizes',async()=>{
  const stages:string[]=[];
  const result=await solveCurveProgressive(makeStroke(x=>x*x,{min:-2,max:2}),{}, {
    now:()=>performance.now(),shouldAbort:()=>false,yieldControl:async()=>{},emit:message=>{
      stages.push(message.stage);
      if(message.result)expect(message.result.best.plot.x).toHaveLength(256);
    },
  });
  expect(stages).toContain('fast-models');
  expect(stages.at(-1)).toBe('finalize');
  expect(result.best.rmse).toBeLessThan(.03);
});
