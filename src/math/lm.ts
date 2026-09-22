import {leastSquares} from './leastSquares';
import {huberLoss,huberWeights} from './robust';

export interface LmOptions {x:ArrayLike<number>;delta?:number;maxIterations?:number}
export interface LmResult {params:Float64Array;loss:number;iterations:number;converged:boolean}
export type LmModel=(theta:Float64Array,x:number)=>number;
export function fitLm(model:LmModel,observed:Float64Array,initial:Float64Array,options:LmOptions):LmResult{
  const n=observed.length,p=initial.length;
  if(n!==options.x.length||p>8||p<1||n<p)throw new RangeError('Invalid LM dimensions');
  let theta=initial.slice(),lambda=.01,rejected=0;
  const delta=Math.max(1e-7,options.delta??.01);
  const residuals=(t:Float64Array):Float64Array|null=>{
    const result=new Float64Array(n);
    for(let i=0;i<n;i++){
      const prediction=model(t,options.x[i]);
      if(!Number.isFinite(prediction)||!Number.isFinite(observed[i])||Math.abs(prediction)>1e100)return null;
      result[i]=prediction-observed[i];
    }
    return result;
  };
  let residual=residuals(theta),loss=residual?huberLoss(residual,delta):Infinity;
  if(!residual)return {params:theta,loss,iterations:0,converged:false};
  for(let iteration=0;iteration<(options.maxIterations??60);iteration++){
    const weights=huberWeights(residual,delta),matrix=new Float64Array((n+p)*p),b=new Float64Array(n+p);
    for(let j=0;j<p;j++){
      const h=1e-5*Math.max(1,Math.abs(theta[j]));
      const plus=theta.slice(),minus=theta.slice();plus[j]+=h;minus[j]-=h;
      for(let i=0;i<n;i++){
        const left=model(plus,options.x[i]),right=model(minus,options.x[i]);
        if(!Number.isFinite(left)||!Number.isFinite(right))continue;
        matrix[i*p+j]=(left-right)/(2*h)*Math.sqrt(weights[i]);
      }
      matrix[(n+j)*p+j]=Math.sqrt(lambda);
    }
    for(let i=0;i<n;i++)b[i]=-residual[i]*Math.sqrt(weights[i]);
    let step:Float64Array;
    try{step=leastSquares(matrix,n+p,p,b).coefficients;}catch{break;}
    const proposal=Float64Array.from(theta,(v,j)=>v+step[j]);
    const proposedResidual=residuals(proposal),proposedLoss=proposedResidual?huberLoss(proposedResidual,delta):Infinity;
    if(proposedLoss<loss){
      const improvement=loss-proposedLoss;
      theta=proposal;residual=proposedResidual!;loss=proposedLoss;lambda=Math.max(1e-8,lambda*.4);rejected=0;
      if(improvement<1e-12||Math.hypot(...step)<1e-8)return {params:theta,loss,iterations:iteration+1,converged:true};
    }else {lambda=Math.min(1e10,lambda*8);if(++rejected>=6)break;}
  }
  return {params:theta,loss,iterations:options.maxIterations??60,converged:false};
}
