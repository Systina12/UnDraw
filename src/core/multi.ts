import type {Point,SolverOptions,FitMode,MultiSolveResult,SolveResult} from './types';
import {solveCurveProgressive,CancelledSolve} from './progressive';
import {finalizeFunctionResult} from './solver';
import {preprocess} from './preprocess';
import {classifyStroke} from './validateFunction';
import {InvalidCurveError} from './preprocess';
import {evaluate} from '../expr/evaluate';
import {resampleFunction} from './resample';
import {normalizeCurve} from './normalize';
import {CandidatePool} from '../search/candidatePool';
import {fitPolynomial} from '../models/polynomial';
import {expressionConstantCost} from '../search/scoring';
import {operatorComplexity} from '../expr/complexity';
import {createParametricAxisPool,finalizeParametricResult} from './parametric';
import {substituteVariable} from '../expr/substitute';
import {variable} from '../expr/ast';
import type {Expr} from '../expr/ast';

interface Segment {points:Point[];strokeIndex:number;noise:number;stride:number}
interface Group {atoms:Segment[];result:SolveResult}
export interface MultiSolveHooks {
  shouldAbort:()=>boolean;
  emit:(result:MultiSolveResult)=>void;
  yieldControl:()=>Promise<void>;
}
const defaultHooks:MultiSolveHooks={shouldAbort:()=>false,emit:()=>{},yieldControl:()=>new Promise(resolve=>setTimeout(resolve,0))};

/** Split substantial x reversals while retaining small hand jitter. */
export function splitAtReversals(stroke:readonly Point[]):Point[][] {
  if(stroke.length<16||classifyStroke(stroke)==='function')return [[...stroke]];
  const xs=stroke.map((_,i)=>{
    let sum=0,count=0;
    for(let k=Math.max(0,i-2);k<=Math.min(stroke.length-1,i+2);k++){sum+=stroke[k].x;count++;}
    return sum/count;
  });
  let minX=Infinity,maxX=-Infinity;
  for(const x of xs){minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
  const span=maxX-minX;
  if(span<.05)return [[...stroke]];
  const threshold=.1*span;
  const cuts=[0];
  let direction=0,extreme=0;
  for(let i=1;i<xs.length;i++){
    if(direction===0){
      if(Math.abs(xs[i]-xs[0])>=threshold){direction=Math.sign(xs[i]-xs[0]);extreme=i;}
    }else if(direction>0){
      if(xs[i]>xs[extreme])extreme=i;
      else if(xs[extreme]-xs[i]>=threshold){if(extreme-cuts.at(-1)!>=7)cuts.push(extreme);direction=-1;extreme=i;}
    }else{
      if(xs[i]<xs[extreme])extreme=i;
      else if(xs[i]-xs[extreme]>=threshold){if(extreme-cuts.at(-1)!>=7)cuts.push(extreme);direction=1;extreme=i;}
    }
  }
  cuts.push(stroke.length-1);
  const segments=cuts.slice(1).map((end,i)=>stroke.slice(cuts[i],end+1));
  return segments.length>1&&segments.every(segment=>segment.length>=8)?segments:[[...stroke]];
}

function snapshot(groups:readonly Group[],mode:FitMode,skipped:number[]):MultiSolveResult {
  return {kind:'multi',mode,groups:groups.map(g=>({
    strokeIndices:[...new Set(g.atoms.map(a=>a.strokeIndex))].sort((a,b)=>a-b),result:g.result,
  })),skipped:[...new Set(skipped)].filter(index=>
    !groups.some(group=>group.atoms.some(atom=>atom.strokeIndex===index)))};
}
function score(groups:readonly Group[]):number {
  const n=groups.reduce((sum,g)=>sum+g.atoms.reduce((s,a)=>s+Math.ceil(a.points.length/a.stride),0),0);
  let loss=0;
  for(const group of groups){
    const candidate=group.result.balanced;
    for(const atom of group.atoms){
      let error=0,count=0;
      for(let i=0;i<atom.points.length;i+=atom.stride){
        if(group.result.mode==='function'){
          const prediction=evaluate(candidate.expr,atom.points[i].x);
          if(!prediction.valid||!Number.isFinite(prediction.value))return Infinity;
          error+=(prediction.value-atom.points[i].y)**2;
        }
        count++;
      }
      if(group.result.mode==='parametric')error=count*candidate.rmse**2;
      let minY=Infinity,maxY=-Infinity;
      for(const point of atom.points){minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);}
      const scale=maxY-minY;
      const noise=Math.max(atom.noise,.003*scale,1e-4);
      loss+=count*Math.log(Math.max(error/count,noise*noise)+1e-12);
    }
    loss+=(candidate.complexity+2)*Math.log(Math.max(n,8));
  }
  return loss;
}

/** Fit only observed intervals. The single-stroke resampler discards disconnected islands. */
function mergedData(atoms:Segment[]){
  const samples=atoms.flatMap(atom=>{
    const sampled=resampleFunction(atom.points,Math.min(64,Math.max(24,atom.points.length)));
    return Array.from(sampled.x,(x,i)=>({x,y:sampled.rawY[i],weight:sampled.weights[i]}));
  }).sort((a,b)=>a.x-b.x);
  const x=Float64Array.from(samples,p=>p.x),rawY=Float64Array.from(samples,p=>p.y);
  const weights=Float64Array.from(samples,p=>p.weight);
  const domain:[number,number]=[x[0],x.at(-1)!];
  const noise=Math.max(1e-9,...atoms.map(atom=>atom.noise));
  return normalizeCurve({x,rawY,weights,domain},rawY,noise);
}
/** A disconnected drawing gives no evidence for a pole or a large excursion between strokes. */
function safeBetweenStrokes(expr:Expr,atoms:Segment[],data:ReturnType<typeof mergedData>):boolean {
  const intervals=atoms.map(atom=>{
    let min=Infinity,max=-Infinity;
    for(const point of atom.points){min=Math.min(min,point.x);max=Math.max(max,point.x);}
    return [min,max] as const;
  }).sort((a,b)=>a[0]-b[0]);
  const ymin=Math.min(...data.rawY),ymax=Math.max(...data.rawY);
  const margin=Math.max(.5*(ymax-ymin),10*data.sigmaDraw,.05);
  let right=intervals[0][1];
  for(const [start,end] of intervals.slice(1)){
    if(start>right){
      for(let i=0;i<=20;i++){
        const prediction=evaluate(expr,right+(start-right)*i/20);
        if(!prediction.valid||!Number.isFinite(prediction.value)||
          prediction.value<ymin-margin||prediction.value>ymax+margin)return false;
      }
    }
    right=Math.max(right,end);
  }
  return true;
}
function fitMerged(a:Group,b:Group):SolveResult {
  const atoms=[...a.atoms,...b.atoms];
  const data=mergedData(atoms);
  const pool=new CandidatePool(data,32);
  for(const group of [a,b])for(const candidate of [group.result.simple,group.result.balanced,group.result.accurate]){
    // Existing fitted expressions provide useful nonlinear models without another full search.
    const freeParameterCount=Math.max(0,Math.round(candidate.complexity-
      operatorComplexity(candidate.expr)-expressionConstantCost(candidate.expr)));
    if(safeBetweenStrokes(candidate.expr,atoms,data))pool.add({expr:candidate.expr,modelFamily:candidate.modelFamily??'Merged',
      approximation:candidate.approximation,freeParameterCount,params:[]});
  }
  for(let degree=0;degree<=4;degree++){
    const candidate=fitPolynomial(data,degree);
    if(candidate&&safeBetweenStrokes(candidate.expr,atoms,data))pool.add(candidate);
  }
  return finalizeFunctionResult(pool,data,performance.now(),'completed',undefined,
    expr=>safeBetweenStrokes(expr,atoms,data));
}

async function fitQuick(points:Point[],options:Partial<SolverOptions>,hooks:MultiSolveHooks):Promise<SolveResult> {
  return solveCurveProgressive(points,{...options,timeBudgetMs:0},{
    now:()=>performance.now(),shouldAbort:hooks.shouldAbort,yieldControl:hooks.yieldControl,emit:()=>{},
  });
}

async function splitIfSimpler(groups:Group[],options:Partial<SolverOptions>,hooks:MultiSolveHooks,
  mode:FitMode,skipped:number[],deadline:number):Promise<void> {
  let changed=true;
  while(changed){
    changed=false;
    for(let index=0;index<groups.length;index++){
      if(hooks.shouldAbort())throw new CancelledSolve();
      if(performance.now()>=deadline)return;
      const group=groups[index];
      if(group.atoms.length!==1||group.result.mode!=='function')continue;
      const atom=group.atoms[0];
      if(atom.points.length<40)continue;
      let ymin=Infinity,ymax=-Infinity;
      for(const point of atom.points){ymin=Math.min(ymin,point.y);ymax=Math.max(ymax,point.y);}
      if(group.result.balanced.rmse<=Math.max(2.5*atom.noise,.004*(ymax-ymin)))continue;
      let best=score(groups),choice:[Group,Group]|null=null;
      for(const fraction of [.25,.5,.75]){
        if(performance.now()>=deadline)break;
        const cut=Math.floor((atom.points.length-1)*fraction);
        if(cut<16||atom.points.length-cut<16)continue;
        const left:Segment={...atom,points:atom.points.slice(0,cut+1)};
        const right:Segment={...atom,points:atom.points.slice(cut)};
        let fittedLeft:SolveResult,fittedRight:SolveResult;
        try{
          fittedLeft=await fitQuick(left.points,options,hooks);
          fittedRight=await fitQuick(right.points,options,hooks);
        }catch(error){
          if(error instanceof CancelledSolve)throw error;
          continue;
        }
        if(fittedLeft.mode!=='function'||fittedRight.mode!=='function')continue;
        const children:[Group,Group]=[{atoms:[left],result:fittedLeft},{atoms:[right],result:fittedRight}];
        const cost=score(groups.flatMap((current,i)=>i===index?children:[current]));
        if(cost<best-2){best=cost;choice=children;}
      }
      if(!choice)continue;
      groups.splice(index,1,...choice);
      hooks.emit(snapshot(groups,mode,skipped));
      if(options.timeBudgetMs!==0)for(const child of choice){
        if(hooks.shouldAbort())throw new CancelledSolve();
        if(performance.now()>=deadline)break;
        try{
          child.result=await solveCurveProgressive(child.atoms[0].points,
            {...options,timeBudgetMs:Math.min(500,Math.max(0,deadline-performance.now()))},{
              now:()=>performance.now(),shouldAbort:hooks.shouldAbort,yieldControl:hooks.yieldControl,
              emit:message=>{
                if(message.result){child.result=message.result;hooks.emit(snapshot(groups,mode,skipped));}
              },
            });
          hooks.emit(snapshot(groups,mode,skipped));
        }catch(error){if(error instanceof CancelledSolve)throw error;}
      }
      changed=true;
      break;
    }
  }
}
function compatible(a:Group,b:Group):boolean {
  if(a.result.mode!=='function'||b.result.mode!=='function')return false;
  const [amin,amax]=a.result.domain,[bmin,bmax]=b.result.domain;
  const overlap=Math.min(amax,bmax)-Math.max(amin,bmin);
  const points=[...a.atoms,...b.atoms].flatMap(s=>s.points);
  let ymin=Infinity,ymax=-Infinity;
  for(const p of points){ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.y);}
  const tolerance=Math.max(.08*(ymax-ymin),4*a.result.noise,4*b.result.noise,.02);
  if(overlap<=0){
    const gap=Math.max(amin,bmin)-Math.min(amax,bmax);
    if(gap>1.5*Math.max(amax-amin,bmax-bmin))return false;
    // Two independently fitted expressions should agree when extended across an unobserved gap.
    // Otherwise a low-degree interpolation can connect unrelated strokes arbitrarily.
    const left=Math.min(amax,bmax);
    for(let i=0;i<=4;i++){
      const x=left+gap*i/4;
      const first=evaluate(a.result.balanced.expr,x),second=evaluate(b.result.balanced.expr,x);
      if(!first.valid||!second.valid||!Number.isFinite(first.value)||!Number.isFinite(second.value)||
        Math.abs(first.value-second.value)>tolerance)return false;
    }
    return true;
  }
  for(let i=0;i<=8;i++){
    const x=Math.max(amin,bmin)+overlap*i/8;
    const left=evaluate(a.result.balanced.expr,x),right=evaluate(b.result.balanced.expr,x);
    if(!left.valid||!right.valid||Math.abs(left.value-right.value)>tolerance)return false;
  }
  return true;
}

export async function solveStrokesProgressive(strokes:readonly (readonly Point[])[],mode:FitMode,
  options:Partial<SolverOptions>={},hooks:MultiSolveHooks=defaultHooks):Promise<MultiSolveResult> {
  // Decide how to group strokes using the original fits. Presentation preferences apply afterward.
  const fitOptions:Partial<SolverOptions>={...options,simplify:{enabled:false}};
  // A shared deadline prevents the number of strokes from multiplying the search budget.
  // An explicit zero skips extended per-stroke search; grouping still needs time to inspect
  // every compatible pair, especially when there are many short strokes on a slow device.
  const deadline=options.timeBudgetMs===0?Infinity:
    performance.now()+(options.timeBudgetMs&&options.timeBudgetMs>0?options.timeBudgetMs:2500);
  const atoms:Segment[]=[];
  for(let i=0;i<strokes.length;i++){
    if(strokes[i].length<2)continue;
    const parts=mode==='auto'?splitAtReversals(strokes[i]):[[...strokes[i]]];
    for(const points of parts)atoms.push({points,strokeIndex:i,noise:0,
      stride:Math.max(1,Math.ceil(points.length/64))});
  }
  const skipped=strokes.map((_,i)=>i).filter(i=>!atoms.some(atom=>atom.strokeIndex===i));
  if(!atoms.length)throw new InvalidCurveError('too-few-points');
  const groups:Group[]=[];
  for(let index=0;index<atoms.length;index++){
    const atom=atoms[index];
    if(hooks.shouldAbort())throw new CancelledSolve();
    try{
      const remaining=atoms.length-index;
      const budget=options.timeBudgetMs===0?0:Math.min(atoms.length===1?Infinity:900,
        Math.max(0,(deadline-performance.now()-(mode==='auto'?400:0))/remaining));
      const result=await solveCurveProgressive(atom.points,{...fitOptions,timeBudgetMs:budget},{
        now:()=>performance.now(),shouldAbort:hooks.shouldAbort,yieldControl:hooks.yieldControl,
        emit:message=>{
          if(message.result){
            atom.noise=message.result.noise;
            hooks.emit(snapshot([...groups,{atoms:[atom],result:message.result}],mode,skipped));
          }
        },
      });
      atom.noise=result.noise;
      groups.push({atoms:[atom],result});
    }catch(error){
      if(error instanceof CancelledSolve)throw error;
      if(error instanceof InvalidCurveError){skipped.push(atom.strokeIndex);continue;}
      throw error;
    }
    hooks.emit(snapshot(groups,mode,skipped));
  }
  if(!groups.length)throw new InvalidCurveError('no-finite-samples');
  if(mode==='auto'){
    await splitIfSimpler(groups,fitOptions,hooks,mode,skipped,deadline);
    let improved=true;
    while(improved&&groups.length>1&&performance.now()<deadline){
      improved=false;
      const original=score(groups);
      let bestCost=original,bestPair:[number,number,SolveResult]|null=null;
      pairs:for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
        if(hooks.shouldAbort())throw new CancelledSolve();
        if(performance.now()>=deadline)break pairs;
        if(!compatible(groups[i],groups[j]))continue;
        const mergedAtoms=[...groups[i].atoms,...groups[j].atoms];
        let result:SolveResult;
        try{result=fitMerged(groups[i],groups[j]);}
        catch{continue;}
        if(result.mode!=='function')continue;
        const merged={atoms:mergedAtoms,result};
        const cost=score(groups.filter((_,index)=>index!==i&&index!==j).concat(merged));
        if(cost<bestCost-.5){bestCost=cost;bestPair=[i,j,result];}
        await hooks.yieldControl();
      }
      if(bestPair){
        const [i,j,result]=bestPair;
        groups[i]={atoms:[...groups[i].atoms,...groups[j].atoms],result};
        groups.splice(j,1);
        improved=true;
        hooks.emit(snapshot(groups,mode,skipped));
      }
    }
  }
  if(options.simplify?.enabled)for(const group of groups){
    if(hooks.shouldAbort())throw new CancelledSolve();
    try{
      if(group.result.mode==='parametric'){
        if(group.atoms.length!==1)continue;
        const prepared=preprocess(group.atoms[0].points,options.sampleCount??256);
        if(prepared.mode!=='parametric')continue;
        const left=createParametricAxisPool(prepared.data,'x',32);
        const right=createParametricAxisPool(prepared.data,'y',32);
        for(const candidate of [...group.result.pareto,group.result.balanced,group.result.accurate]){
          if(!candidate.parametric)continue;
          for(const [pool,expr] of [[left,candidate.parametric.xExpr],[right,candidate.parametric.yExpr]] as const){
            const axisExpr=substituteVariable(expr,'t',variable('x'));
            pool.add({expr:axisExpr,modelFamily:candidate.modelFamily??'Parametric',
              params:[],freeParameterCount:0,approximation:candidate.approximation});
          }
        }
        const simplified=finalizeParametricResult(prepared.data,left,right,performance.now(),
          group.result.diagnostics.stopReason,options.simplify);
        group.result={...simplified,diagnostics:group.result.diagnostics};
        hooks.emit(snapshot(groups,mode,skipped));
        await hooks.yieldControl();
        continue;
      }
      const data=group.atoms.length===1?preprocess(group.atoms[0].points,
        options.sampleCount??256):null;
      const curve=data?.mode==='function'?data.data:mergedData(group.atoms);
      const pool=new CandidatePool(curve,Math.max(32,group.result.pareto.length+4));
      const results=[...group.result.pareto,group.result.balanced];
      for(const candidate of results){
        const freeParameterCount=Math.max(0,Math.round(candidate.complexity-
          operatorComplexity(candidate.expr)-expressionConstantCost(candidate.expr)));
        pool.add({expr:candidate.expr,modelFamily:candidate.modelFamily??'Fit',params:[],
          approximation:candidate.approximation,freeParameterCount});
      }
      const simplified=finalizeFunctionResult(pool,curve,performance.now(),
        group.result.diagnostics.stopReason,options.simplify,
        group.atoms.length>1?expr=>safeBetweenStrokes(expr,group.atoms,curve):undefined);
      group.result={...simplified,diagnostics:group.result.diagnostics};
      hooks.emit(snapshot(groups,mode,skipped));
      await hooks.yieldControl();
    }catch(error){
      if(error instanceof CancelledSolve)throw error;
      if(!(error instanceof InvalidCurveError)&&
        !(error instanceof Error&&error.message==='No valid parametric candidate'))throw error;
    }
  }
  return snapshot(groups,mode,skipped);
}
