import type {ParametricData} from './preprocess';
import type {CandidateResult,SolveResult,SolverOptions} from './types';
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
  start:number,stopReason='parametric-fit'):SolveResult {
  const xs=left.frontier().slice(0,8),ys=right.frontier().slice(0,8);
  const scale=Math.max(1e-9,Math.hypot(Math.max(...data.rawX)-Math.min(...data.rawX),
    Math.max(...data.rawY)-Math.min(...data.rawY))/2);
  const pairs:Pair[]=[];
  for(const xc of xs)for(const yc of ys){
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
    if(!valid)continue;
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
    pairs.push({x:xc,y:yc,result});
  }
  if(!pairs.length)throw new Error('No valid parametric candidate');
  pairs.sort((a,b)=>a.result.complexity-b.result.complexity||a.result.rmse-b.result.rmse);
  const frontier:Pair[]=[];let minError=Infinity;
  for(const pair of pairs)if(pair.result.rmse<minError-1e-9){frontier.push(pair);minError=pair.result.rmse;}
  const accurate=[...frontier].sort((a,b)=>a.result.rmse-b.result.rmse)[0];
  const noise=Math.max(data.sigmaDraw,1e-9),threshold=2.5*Math.max(noise,accurate.result.rmse);
  const simple=frontier.filter(p=>p.result.rmse<=threshold).sort((a,b)=>a.result.complexity-b.result.complexity)[0];
  const balanced=[...frontier].sort((a,b)=>a.result.score-b.result.score)[0];
  const ratio=balanced.result.rmse/noise;
  const quality: SolveResult['quality']=balanced.result.approximation?'approximation':
    ratio<=1.5?'excellent':ratio<=3?'good':ratio<=6?'approximation':'low';
  return {mode:'parametric',best:balanced.result,simple:simple.result,balanced:balanced.result,
    accurate:accurate.result,pareto:frontier.map(pair=>pair.result),domain:[0,1],noise,
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
  return finalizeParametricResult(data,left,right,start);
}
