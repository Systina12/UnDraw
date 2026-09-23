/** Bounded golden-section refinement; invalid samples have infinite cost. */
export function minimizeBounded(f:(x:number)=>number,lo:number,hi:number,tol=1e-6):{x:number;fx:number}{
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi<=lo)throw new RangeError('Invalid interval');
  const score=(x:number)=>{const value=f(x);return Number.isFinite(value)?value:Infinity;};
  const ratio=(Math.sqrt(5)-1)/2;
  let a=lo,b=hi,c=b-ratio*(b-a),d=a+ratio*(b-a),fc=score(c),fd=score(d);
  for(let iteration=0;iteration<90&&b-a>tol*Math.max(1,Math.abs(c),Math.abs(d));iteration++){
    if(fc<=fd){b=d;d=c;fd=fc;c=b-ratio*(b-a);fc=score(c);}
    else{a=c;c=d;fc=fd;d=a+ratio*(b-a);fd=score(d);}
  }
  const x=fc<=fd?c:d;
  return {x,fx:score(x)};
}
