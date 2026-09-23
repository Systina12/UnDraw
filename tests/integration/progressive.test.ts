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
it('reports real phase timings without interfering with progressive results',async()=>{
  const phases=new Map<string,number>();
  const result=await solveCurveProgressive(makeStroke(x=>x*x,{min:-2,max:2,seed:9}),{}, {
    now:()=>performance.now(),shouldAbort:()=>false,yieldControl:async()=>{},emit:()=>{},
    onPhase:(name,elapsedMs)=>{phases.set(name,(phases.get(name)??0)+elapsedMs);},
  });
  expect(result.balanced.plot.y).toHaveLength(256);
  for(const name of ['preprocess','fast-models','extended-models','fallback','beautify','finalize']){
    expect(phases.has(name),name).toBe(true);
    expect(phases.get(name),name).toBeGreaterThanOrEqual(0);
  }
});
it('stops after finding a concise sinusoid despite one isolated drawing outlier',async()=>{
  const phases:string[]=[];
  const points=makeStroke(x=>2*Math.sin(Math.PI*x),{min:-2,max:2,count:180,
    noise:.018,seed:2309,wobble:.004,dropRate:.055,outliers:1,xJitter:.0005,nonuniform:true});
  const result=await solveCurveProgressive(points,{timeBudgetMs:450},{
    now:()=>performance.now(),shouldAbort:()=>false,yieldControl:async()=>{},emit:()=>{},
    onPhase:(name)=>{phases.push(name);},
  });
  expect(result.balanced.latex).toContain('\\pi');
  expect(phases).not.toContain('symbolic');
});
