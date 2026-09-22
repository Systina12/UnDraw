import type {CurveData} from '../core/normalize';
import type {Candidate,CandidateDraft} from './producer';
import {evaluate} from '../expr/evaluate';
import {simplify} from '../expr/simplify';
import {structuralHash} from '../expr/canonical';
import {operatorComplexity} from '../expr/complexity';
import {expressionCost,scoreMdl} from './scoring';
import {paretoPrune} from './pareto';

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
      const expr=simplify(draft.expr,this.data.domain);
      const signature=structuralHash(expr);
      if(this.candidates.has(signature))return false;
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
      const complexity=operatorComplexity(expr)+draft.freeParameterCount;
      const score=scoreMdl({mseNormalized,sigmaNormalized:this.data.sigmaDraw/scale,n,k:expressionCost(expr,draft.freeParameterCount)});
      const candidate:Candidate={...draft,expr,metrics:{rmse,normalizedRmse:rmse/scale,mseNormalized,robustError:huber/n,maxError:maxError*scale},complexity,score,signature};
      if(!Number.isFinite(score))throw Error('Invalid score');
      this.candidates.set(signature,candidate);
      if(this.candidates.size>this.capacity){
        const worst=[...this.candidates.values()].sort((a,b)=>b.score-a.score)[0];
        this.candidates.delete(worst.signature);
      }
      return this.candidates.has(signature);
    }catch{this.rejected++;return false;}
  }
}
