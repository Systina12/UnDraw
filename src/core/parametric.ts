import type {ParametricData} from './preprocess';
import type {CandidateResult,SolveResult,SolverOptions,SimplicityOptions} from './types';
import type {CurveData} from './normalize';
import {normalizeCurve} from './normalize';
import {fitPolynomial} from '../models/polynomial';
import {fitSinusoid} from '../models/sinusoid';
import {fitFourier} from '../models/fourier';
import {CandidatePool} from '../search/candidatePool';
import {selectRepresentatives} from '../search/pareto';
import {scoreMdl} from '../search/scoring';
import type {Candidate} from '../search/producer';
import {substituteVariable} from '../expr/substitute';
import {variable} from '../expr/ast';
import {evaluate} from '../expr/evaluate';
import {toLatex} from '../expr/latex';
import {toPlain} from '../expr/plain';
import {beautifyPool} from '../beautify/beautify';
import {allowedChange,descriptionCost,relaxedCandidates,resolveSimplicity} from '../beautify/relaxed';

function axisData(data:ParametricData,axis:'x'|'y'):CurveData {
  const rawY=axis==='x'?data.rawX:data.rawY;
  const smoothY=axis==='x'?data.smoothX:data.smoothY;
  const sigma=axis==='x'?data.sigmaX:data.sigmaY;
  return normalizeCurve({x:data.t,rawY,weights:new Float64Array(data.t.length).fill(1),domain:[0,1]},smoothY,sigma);
}
export function createParametricAxisPool(data:ParametricData,axis:'x'|'y',capacity:number):CandidatePool {
  return new CandidatePool(axisData(data,axis),capacity);
}

export function fitParametricAxisStage(pool:CandidatePool,stage:'quick'|'extended'|'fallback'|'beautify',
  shouldStop:()=>boolean=()=>false):void {
  const data=pool.data;
  if(stage==='quick')for(let degree=0;degree<=4;degree++){
    const fitted=fitPolynomial(data,degree);if(fitted)pool.add(fitted);
  }
  if(stage==='extended'){
    if(shouldStop())return;
    for(const fitted of fitSinusoid(data)){if(shouldStop())break;pool.add(fitted);}
    if(shouldStop())return;
    for(const fitted of fitFourier(data,2)){if(shouldStop())break;pool.add(fitted);}
  }
  if(stage==='fallback')for(const degree of [8,12]){
    if(shouldStop())break;
    const fitted=fitPolynomial(data,degree);
    if(fitted)pool.add({...fitted,modelFamily:'chebyshev-fallback',approximation:true});
  }
  if(stage==='beautify'&&!shouldStop())beautifyPool(pool);
}
interface Pair {x:Candidate;y:Candidate;result:CandidateResult}
export function finalizeParametricResult(data:ParametricData,left:CandidatePool,right:CandidatePool,
  start:number,stopReason='parametric-fit',simplicity?:Partial<SimplicityOptions>):SolveResult {
  const xs=left.frontier().slice(0,8),ys=right.frontier().slice(0,8);
  const scale=Math.max(1e-9,Math.hypot(Math.max(...data.rawX)-Math.min(...data.rawX),
    Math.max(...data.rawY)-Math.min(...data.rawY))/2);
  const pairs:Pair[]=[];
  const makePair=(xc:Candidate,yc:Candidate):Pair|null=>{
    const xExpr=substituteVariable(xc.expr,'x',variable('t'));
    const yExpr=substituteVariable(yc.expr,'x',variable('t'));
    let sum=0,valid=true;
    const plot={x:[] as number[],y:[] as number[]};
    for(let i=0;i<data.t.length;i++){
      const x=evaluate(xExpr,data.t[i]),y=evaluate(yExpr,data.t[i]);
      if(!x.valid||!y.valid){valid=false;break;}
      plot.x.push(x.value);plot.y.push(y.value);
      sum+=(x.value-data.rawX[i])**2+(y.value-data.rawY[i])**2;
    }
    if(!valid)return null;
    const rmse=Math.sqrt(sum/data.t.length),complexity=xc.complexity+yc.complexity;
    const score=scoreMdl({mseNormalized:sum/data.t.length/scale**2,
      sigmaNormalized:data.sigmaDraw/scale,n:data.t.length,k:complexity});
    const xLatex=toLatex(xExpr),yLatex=toLatex(yExpr);
    const xPlain=toPlain(xExpr),yPlain=toPlain(yExpr);
    const result:CandidateResult={expr:xExpr,latex:`\\begin{aligned}x(t)&=${xLatex}\\\\y(t)&=${yLatex}\\end{aligned}`,
      plain:`x(t) = ${xPlain}; y(t) = ${yPlain}`,rmse,normalizedRmse:rmse/scale,
      complexity,score,modelFamily:`${xc.modelFamily} + ${yc.modelFamily}`,
      approximation:xc.approximation||yc.approximation,plot,
      parametric:{xExpr,yExpr,xLatex,yLatex,xPlain,yPlain}};
    return {x:xc,y:yc,result};
  };
  for(const xc of xs)for(const yc of ys){const pair=makePair(xc,yc);if(pair)pairs.push(pair);}
  if(!pairs.length)throw new Error('No valid parametric candidate');
  pairs.sort((a,b)=>a.result.complexity-b.result.complexity||a.result.rmse-b.result.rmse);
  const frontier:Pair[]=[];let minError=Infinity;
  for(const pair of pairs)if(pair.result.rmse<minError-1e-9){frontier.push(pair);minError=pair.result.rmse;}
  const accurate=[...frontier].sort((a,b)=>a.result.rmse-b.result.rmse)[0];
  const noise=Math.max(data.sigmaDraw,1e-9),threshold=2.5*Math.max(noise,accurate.result.rmse);
  let simple=frontier.filter(p=>p.result.rmse<=threshold).sort((a,b)=>a.result.complexity-b.result.complexity)[0];
  let balanced=[...frontier].sort((a,b)=>a.result.score-b.result.score)[0];
  const originalBalanced=balanced;
  const preference=resolveSimplicity(simplicity);
  let choices=frontier;
  if(preference.enabled&&preference.tolerance>0){
    const xChoices=[balanced.x,...relaxedCandidates(balanced.x,xs,left.data,preference,scale).slice(0,5)];
    const yChoices=[balanced.y,...relaxedCandidates(balanced.y,ys,right.data,preference,scale).slice(0,5)];
    const alternatives:Pair[]=[];
    for(const xc of xChoices)for(const yc of yChoices){
      if(!allowedChange(balanced.x,xc,left.data,preference,scale)||
        !allowedChange(balanced.y,yc,right.data,preference,scale))continue;
      const pair=makePair(xc,yc);
      if(!pair||pair.result.rmse>balanced.result.rmse+preference.tolerance*scale)continue;
      let sumChange=0,peakChange=0;
      for(let i=0;i<data.t.length;i++){
        const distance=Math.hypot(pair.result.plot.x[i]-balanced.result.plot.x[i],
          pair.result.plot.y[i]-balanced.result.plot.y[i]);
        sumChange+=distance*distance;
        peakChange=Math.max(peakChange,distance);
      }
      const budget=preference.tolerance*scale;
      if(Math.sqrt(sumChange/data.t.length)<=budget&&peakChange<=3*budget)alternatives.push(pair);
    }
    const cost=(pair:Pair)=>descriptionCost(pair.x)+descriptionCost(pair.y);
    const ranked=[balanced,...alternatives].sort((a,b)=>cost(a)-cost(b)||a.result.rmse-b.result.rmse);
    if(cost(ranked[0])<cost(balanced)-.1)balanced=ranked[0];
    simple=ranked[0];
    choices=[...frontier,...alternatives].sort((a,b)=>cost(a)-cost(b)||a.result.rmse-b.result.rmse)
      .filter((pair,index,array)=>!array.slice(0,index).some(previous=>
        cost(previous)<=cost(pair)&&previous.result.rmse<=pair.result.rmse));
  }
  const ratio=balanced.result.rmse/noise;
  const simplified=balanced.x.signature!==originalBalanced.x.signature||
    balanced.y.signature!==originalBalanced.y.signature;
  let quality: SolveResult['quality']=balanced.result.approximation?'approximation':
    ratio<=1.5?'excellent':ratio<=3?'good':ratio<=6?'approximation':'low';
  if(simplified&&quality==='low'&&originalBalanced.result.rmse/noise<=6)quality='approximation';
  return {mode:'parametric',simplified,best:balanced.result,simple:simple.result,balanced:balanced.result,
    accurate:accurate.result,pareto:choices.map(pair=>pair.result),domain:[0,1],noise,
    quality,diagnostics:{runtimeMs:performance.now()-start,candidatesGenerated:left.generated+right.generated,
      candidatesFitted:left.size+right.size,candidatesRejected:left.rejected+right.rejected,maxComplexityReached:0,
      stopReason}};
}

export function solveParametric(data:ParametricData,options:SolverOptions,start=performance.now()):SolveResult {
  const left=createParametricAxisPool(data,'x',options.semanticBeamWidth);
  const right=createParametricAxisPool(data,'y',options.semanticBeamWidth);
  for(const stage of ['quick','extended','fallback','beautify'] as const){
    fitParametricAxisStage(left,stage);
    fitParametricAxisStage(right,stage);
  }
  return finalizeParametricResult(data,left,right,start,'parametric-fit',options.simplify);
}
