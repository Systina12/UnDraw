import type {CurveData} from '../core/normalize';
import type {Expr} from '../expr/ast';
import type {Candidate,CandidateDraft} from './producer';
import {evaluate} from '../expr/evaluate';
import {simplify} from '../expr/simplify';
import {structuralHash} from '../expr/canonical';
import {operatorComplexity} from '../expr/complexity';
import {expressionCost,expressionConstantCost,scoreMdl} from './scoring';
import {paretoPrune} from './pareto';
import {displayExpr} from '../expr/display';

function dependsOnX(expr:Expr):boolean {
  if(expr.kind==='var')return true;
  if(expr.kind==='const')return false;
  if(expr.kind==='add'||expr.kind==='mul')return expr.args.some(dependsOnX);
  if(expr.kind==='div')return dependsOnX(expr.a)||dependsOnX(expr.b);
  if(expr.kind==='pow')return dependsOnX(expr.base)||dependsOnX(expr.exponent);
  return 'arg' in expr&&dependsOnX(expr.arg);
}

function variableDenominators(expr:Expr,output:Expr[]=[]):Expr[] {
  if(expr.kind==='div'){
    if(dependsOnX(expr.b))output.push(expr.b);
    variableDenominators(expr.a,output);variableDenominators(expr.b,output);
  }else if(expr.kind==='add'||expr.kind==='mul')expr.args.forEach(arg=>variableDenominators(arg,output));
  else if(expr.kind==='pow'){
    variableDenominators(expr.base,output);variableDenominators(expr.exponent,output);
  }else if('arg' in expr)variableDenominators(expr.arg,output);
  return output;
}

export class CandidatePool {
  private candidates=new Map<string,Candidate>();
  rejected=0;
  generated=0;
  constructor(readonly data:CurveData,readonly capacity=300){}
  get size():number{return this.candidates.size;}
  all():Candidate[]{return [...this.candidates.values()];}
  frontier():Candidate[]{return paretoPrune(this.all());}
  add(draft:CandidateDraft):boolean {
    this.generated++;
    try {
      // Score the formula users can actually copy. Rounding after simplification also catches
      // new constants created by constant folding.
      const expr=displayExpr(simplify(displayExpr(draft.expr),this.data.domain));
      const signature=structuralHash(expr);
      const previous=this.candidates.get(signature);
      if(previous&&previous.freeParameterCount<=draft.freeParameterCount&&
        (!previous.approximation||draft.approximation))return false;
      // Beautification and display rounding can move a rational pole into the domain.
      // Check between sampled points as well as on them before accepting the result.
      const denominators=variableDenominators(expr);
      if(denominators.length){
        const [left,right]=this.data.domain;
        const extent=Math.max(...this.data.rawY.map(Math.abs))+32*this.data.normalization.ys;
        for(const denominator of denominators){
          let previous=0;
          for(let i=0;i<=512;i++){
            const x=left+(right-left)*i/512;
            const value=evaluate(denominator,x);
            if(!value.valid||Math.abs(value.value)<1e-10||i>0&&Math.sign(value.value)!==Math.sign(previous))
              throw Error('Pole in domain');
            previous=value.value;
            const prediction=evaluate(expr,x);
            if(!prediction.valid||Math.abs(prediction.value)>extent)throw Error('Unobserved spike');
          }
        }
      }
      let sum=0,huber=0,maxError=0,invalid=0;
      const scale=Math.max(this.data.normalization.ys,1e-9);
      const delta=Math.max(1.5*this.data.sigmaDraw/scale,.01);
      for(let i=0;i<this.data.x.length;i++){
        const prediction=evaluate(expr,this.data.x[i]);
        if(!prediction.valid){invalid++;continue;}
        const residual=(prediction.value-this.data.rawY[i])/scale;
        const r=Math.abs(residual);
        sum+=residual*residual;huber+=r<=delta?.5*r*r:delta*(r-.5*delta);
        maxError=Math.max(maxError,r);
      }
      if(invalid>this.data.x.length*.02||!Number.isFinite(sum))throw Error('Invalid candidate');
      const n=this.data.x.length-invalid;
      const mseNormalized=sum/n,rmse=Math.sqrt(mseNormalized)*scale;
      const complexity=operatorComplexity(expr)+draft.freeParameterCount+expressionConstantCost(expr);
      const score=scoreMdl({mseNormalized,sigmaNormalized:this.data.sigmaDraw/scale,n,k:expressionCost(expr,draft.freeParameterCount)});
      const candidate:Candidate={...draft,expr,metrics:{rmse,normalizedRmse:rmse/scale,mseNormalized,robustError:huber/n,maxError:maxError*scale},complexity,score,signature};
      if(!Number.isFinite(score))throw Error('Invalid score');
      if(previous&&previous.score<=candidate.score&&
        (previous.approximation===candidate.approximation||!previous.approximation))return false;
      this.candidates.set(signature,candidate);
      if(this.candidates.size>this.capacity){
        const worst=[...this.candidates.values()].sort((a,b)=>b.score-a.score)[0];
        this.candidates.delete(worst.signature);
      }
      return this.candidates.has(signature);
    }catch{this.rejected++;return false;}
  }
}
