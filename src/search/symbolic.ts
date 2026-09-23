import type {CurveData} from '../core/normalize';
import type {Expr} from '../expr/ast';
import {evaluate} from '../expr/evaluate';
import type {TemplateExpr} from '../expr/template';
import {enumerateGrammar,parameterizeShape,fitTemplate,templateHash} from './grammar';
import {semanticSignature} from './semanticHash';
import type {CandidateDraft,SolveContext} from './producer';

function shapeScore(shape:TemplateExpr,data:CurveData):number{
  const argument=shape.kind==='sin'||shape.kind==='cos'?shape.arg:shape;
  const samples:number[]=[],observations:number[]=[];
  for(let i=0;i<data.u.length;i+=8){
    const v=evaluate(argument as Expr,data.u[i]);if(!v.valid)return Infinity;
    samples.push(v.value);observations.push(data.v[i]);
  }
  const n=samples.length,ym=observations.reduce((a,b)=>a+b,0)/n;
  const vy=observations.reduce((a,b)=>a+(b-ym)**2,0);
  const projection=(values:number[]):number=>{
    const xm=values.reduce((a,b)=>a+b,0)/n;
    let vx=0,xy=0;
    for(let i=0;i<n;i++){vx+=(values[i]-xm)**2;xy+=(values[i]-xm)*(observations[i]-ym);}
    return vx<1e-9||vy<1e-9?Infinity:Math.log(Math.max(1e-9,1-xy*xy/(vx*vy)));
  };
  if(shape.kind==='sin'||shape.kind==='cos')return Math.min(...[.5,1,2,3,4,6,8].flatMap(omega=>[
    projection(samples.map(v=>Math.sin(omega*v))),projection(samples.map(v=>Math.cos(omega*v))),
  ]));
  return projection(samples);
}

export function* searchSymbolic(data:CurveData,context:SolveContext,onLevel:(level:number,size:number)=>void=()=>{}):Iterable<CandidateDraft>{
  const now=context.now??(()=>performance.now());
  const byLevel=new Map<number,TemplateExpr[]>([[0,[{kind:'var',name:'x'}]]]);
  const seen=new Set<string>();
  let bestError=context.initialBestError??Infinity,stalled=0;
  for(let level=1;level<=context.options.maxStructuralComplexity;level++){
    if(context.shouldAbort()||now()>=context.deadline)break;
    const generated=enumerateGrammar(level,byLevel,Math.max(16,context.options.semanticBeamWidth));
    const candidates:{shape:TemplateExpr;quality:number}[]=[];
    for(let i=0;i<generated.length;i++){
      if(i%32===0&&(context.shouldAbort()||now()>=context.deadline))break;
      const shape=generated[i];
      const signature=semanticSignature(shape as Expr);
      if(!signature||seen.has(signature))continue;
      seen.add(signature);
      const quality=shapeScore(shape,data)+.02*level;
      if(Number.isFinite(quality))candidates.push({shape,quality});
    }
    candidates.sort((a,b)=>a.quality-b.quality||templateHash(a.shape).localeCompare(templateHash(b.shape)));
    const beam=candidates.slice(0,context.options.semanticBeamWidth);
    byLevel.set(level,beam.map(item=>item.shape));
    onLevel(level,beam.length);
    let improved=false;
    for(const {shape} of beam.slice(0,Math.min(8,context.options.combinationWidth))){
      if(context.shouldAbort()||now()>=context.deadline)break;
      const fitted=fitTemplate(parameterizeShape(shape),data);
      if(!fitted)continue;
      let error=0,valid=true;
      for(let i=0;i<data.x.length;i+=4){
        const result=evaluate(fitted.expr,data.x[i]);
        if(!result.valid){valid=false;break;}
        error+=(result.value-data.rawY[i])**2;
      }
      if(!valid)continue;
      const rmse=Math.sqrt(error/Math.ceil(data.x.length/4));
      if(rmse<bestError*.98){bestError=rmse;improved=true;}
      yield fitted;
    }
    stalled=improved?0:stalled+1;
    if(level>=3&&bestError<=Math.max(1.5*data.sigmaDraw,.008*data.normalization.ys))break;
    if(stalled>=3&&level>=4)break;
  }
}
