import type {Point,SolverOptions,FitMode,MultiSolveResult,SolveResult} from './types';
import {solveCurveProgressive,CancelledSolve} from './progressive';
import {solveCurve} from './solver';
import {classifyStroke} from './validateFunction';
import {InvalidCurveError} from './preprocess';
import {evaluate} from '../expr/evaluate';

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

async function fitQuick(points:Point[],options:Partial<SolverOptions>,hooks:MultiSolveHooks):Promise<SolveResult> {
  return solveCurveProgressive(points,{...options,timeBudgetMs:0},{
    now:()=>performance.now(),shouldAbort:hooks.shouldAbort,yieldControl:hooks.yieldControl,emit:()=>{},
  });
}

async function splitIfSimpler(groups:Group[],options:Partial<SolverOptions>,hooks:MultiSolveHooks,
  mode:FitMode,skipped:number[]):Promise<void> {
  let changed=true;
  while(changed){
    changed=false;
    for(let index=0;index<groups.length;index++){
      if(hooks.shouldAbort())throw new CancelledSolve();
      const group=groups[index];
      if(group.atoms.length!==1||group.result.mode!=='function')continue;
      const atom=group.atoms[0];
      if(atom.points.length<40)continue;
      let ymin=Infinity,ymax=-Infinity;
      for(const point of atom.points){ymin=Math.min(ymin,point.y);ymax=Math.max(ymax,point.y);}
      if(group.result.balanced.rmse<=Math.max(2.5*atom.noise,.004*(ymax-ymin)))continue;
      let best=score(groups),choice:[Group,Group]|null=null;
      for(const fraction of [.25,.5,.75]){
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
        try{
          child.result=await solveCurveProgressive(child.atoms[0].points,
            {...options,timeBudgetMs:options.timeBudgetMs??500},{
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
  if(overlap<=0){
    const gap=Math.max(amin,bmin)-Math.min(amax,bmax);
    return gap<=1.5*Math.max(amax-amin,bmax-bmin);
  }
  const points=[...a.atoms,...b.atoms].flatMap(s=>s.points);
  let ymin=Infinity,ymax=-Infinity;
  for(const p of points){ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.y);}
  const tolerance=Math.max(.08*(ymax-ymin),4*a.result.noise,4*b.result.noise,.02);
  for(let i=0;i<=8;i++){
    const x=Math.max(amin,bmin)+overlap*i/8;
    const left=evaluate(a.result.balanced.expr,x),right=evaluate(b.result.balanced.expr,x);
    if(!left.valid||!right.valid||Math.abs(left.value-right.value)>tolerance)return false;
  }
  return true;
}

export async function solveStrokesProgressive(strokes:readonly (readonly Point[])[],mode:FitMode,
  options:Partial<SolverOptions>={},hooks:MultiSolveHooks=defaultHooks):Promise<MultiSolveResult> {
  const atoms:Segment[]=[];
  for(let i=0;i<strokes.length;i++){
    if(strokes[i].length<8)continue;
    const parts=mode==='auto'?splitAtReversals(strokes[i]):[[...strokes[i]]];
    for(const points of parts)atoms.push({points,strokeIndex:i,noise:0,
      stride:Math.max(1,Math.ceil(points.length/64))});
  }
  const skipped=strokes.map((_,i)=>i).filter(i=>!atoms.some(atom=>atom.strokeIndex===i));
  if(!atoms.length)throw new InvalidCurveError('too-few-points');
  const groups:Group[]=[];
  for(const atom of atoms){
    if(hooks.shouldAbort())throw new CancelledSolve();
    try{
      const result=await solveCurveProgressive(atom.points,{...options,timeBudgetMs:options.timeBudgetMs??900},{
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
    await splitIfSimpler(groups,options,hooks,mode,skipped);
    let improved=true;
    while(improved&&groups.length>1){
      improved=false;
      const original=score(groups);
      let bestCost=original,bestPair:[number,number,SolveResult]|null=null;
      for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
        if(hooks.shouldAbort())throw new CancelledSolve();
        if(!compatible(groups[i],groups[j]))continue;
        const mergedAtoms=[...groups[i].atoms,...groups[j].atoms];
        const points=mergedAtoms.flatMap(atom=>atom.points).sort((a,b)=>a.x-b.x)
          .map((p,k)=>({...p,t:k}));
        let result:SolveResult;
        try{result=solveCurve(points,{...options,maxStructuralComplexity:0,timeBudgetMs:0});}
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
  return snapshot(groups,mode,skipped);
}
