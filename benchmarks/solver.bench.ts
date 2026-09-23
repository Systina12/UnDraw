import {cpus,platform,arch} from 'node:os';
import {performance} from 'node:perf_hooks';
import {solveCurveProgressive} from '../src/core/progressive';
import {makeStroke} from '../tests/fixtures/generateStroke';

const functions:[string,(x:number)=>number][]=[
  ['quadratic',x=>x*x-.5*x+1],
  ['pi-sinusoid',x=>2*Math.sin(Math.PI*x)],
  ['chirp',x=>Math.sin(x*x)],
];

const cases=[];
for(const [family,f] of functions){
  const points=makeStroke(f,{min:-2,max:2,count:180,noise:.018,seed:2309,wobble:.004,
    dropRate:.055,outliers:1,xJitter:.0005,nonuniform:true});
  const phases:Record<string,number>={};
  const progress:{stage:string;elapsedMs:number}[]=[];
  let peakBeam=0,peakHeapUsed=process.memoryUsage().heapUsed;
  const start=performance.now();
  const result=await solveCurveProgressive(points,{timeBudgetMs:700},{
    now:()=>performance.now(),shouldAbort:()=>false,
    yieldControl:()=>new Promise(resolve=>setTimeout(resolve,0)),
    emit:message=>{progress.push({stage:message.stage,elapsedMs:performance.now()-start});
      peakHeapUsed=Math.max(peakHeapUsed,process.memoryUsage().heapUsed);},
    onPhase:(phase,elapsedMs)=>{phases[phase]=(phases[phase]??0)+elapsedMs;
      peakHeapUsed=Math.max(peakHeapUsed,process.memoryUsage().heapUsed);},
    onBeam:(_level,size)=>{peakBeam=Math.max(peakBeam,size);},
  });
  cases.push({family,inputPoints:points.length,samples:result.best.plot.x.length,
    phases,progress,diagnostics:result.diagnostics,peakBeam,peakHeapUsed,
    balanced:{plain:result.balanced.plain,rmse:result.balanced.rmse,quality:result.quality}});
}
process.stdout.write(JSON.stringify({environment:{node:process.version,platform:platform(),architecture:arch(),
  cpu:cpus()[0]?.model,logicalCores:cpus().length},cases},null,2)+'\n');
