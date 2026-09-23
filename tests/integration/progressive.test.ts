import {expect,it,vi} from 'vitest';
import {solveCurveProgressive} from '../../src/core/progressive';
import {solveCurve} from '../../src/core/solver';
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

it('counts fast model fitting against the progressive deadline',async()=>{
  const phases:string[]=[];
  const result=await solveCurveProgressive(makeStroke(x=>x*x,{min:-2,max:2}),{timeBudgetMs:0},{
    now:()=>performance.now(),shouldAbort:()=>false,yieldControl:async()=>{},emit:()=>{},
    onPhase:name=>{phases.push(name);},
  });
  expect(result.best.plot.x).toHaveLength(256);
  expect(phases).toContain('fast-models');
  expect(phases).not.toContain('extended-models');
  expect(phases).not.toContain('fallback');
});

it('streams a parametric estimate before fitting extended models',async()=>{
  const circle=Array.from({length:160},(_,i)=>{
    const angle=i*2*Math.PI/159;
    return {x:2*Math.cos(angle),y:2*Math.sin(angle),t:i};
  });
  const events:string[]=[];
  const result=await solveCurveProgressive(circle,{timeBudgetMs:10000},{
    now:()=>performance.now(),shouldAbort:()=>false,yieldControl:async()=>{},
    emit:message=>{if(message.result)events.push(message.stage);},
    onPhase:name=>events.push(name),
  });
  expect(result.mode).toBe('parametric');
  expect(events.indexOf('fast-models')).toBeGreaterThanOrEqual(0);
  expect(events.indexOf('fast-models')).toBeLessThan(events.indexOf('parametric-extended'));
  expect(events).toContain('extended-models');
});

it('stops parametric fitting after the first usable estimate when the budget is spent',async()=>{
  const circle=Array.from({length:160},(_,i)=>{
    const angle=i*2*Math.PI/159;
    return {x:2*Math.cos(angle),y:2*Math.sin(angle),t:i};
  });
  const stages:string[]=[];
  const result=await solveCurveProgressive(circle,{timeBudgetMs:0},{
    now:()=>performance.now(),shouldAbort:()=>false,yieldControl:async()=>{},
    emit:message=>stages.push(message.stage),
  });
  expect(result.mode).toBe('parametric');
  expect(result.diagnostics.candidatesGenerated).toBeLessThan(20);
  expect(stages).toContain('fast-models');
  expect(stages).not.toContain('extended-models');
});

it('keeps synchronous null-budget search independent of wall-clock ticks',()=>{
  const clock=vi.spyOn(performance,'now');
  let ticks=0;
  clock.mockImplementation(()=>++ticks*1000);
  try {
    const result=solveCurve(makeStroke(x=>Math.sin(x*x),{min:-2,max:2,count:160}),{
      maxStructuralComplexity:2,timeBudgetMs:null,
    });
    expect(result.diagnostics.maxComplexityReached).toBeGreaterThan(0);
  } finally {
    clock.mockRestore();
  }
});
