export function huberWeights(residuals:Float64Array,delta:number):Float64Array{
  return Float64Array.from(residuals,r=>Math.abs(r)<=delta?1:delta/Math.max(Math.abs(r),1e-12));
}
export function huberLoss(residuals:Float64Array,delta:number):number{
  let total=0;
  for(const residual of residuals){const r=Math.abs(residual);total+=r<=delta?.5*r*r:delta*(r-.5*delta);}
  return total;
}
