export function gcd(a:number,b:number):number {a=Math.abs(a);b=Math.abs(b);while(b)[a,b]=[b,a%b];return a||1;}
export function rationalNear(value:number,maxDenominator=12,maxNumerator=48):{p:number;q:number}[]{
  const output=new Map<string,{p:number;q:number}>();
  for(let q=1;q<=maxDenominator;q++)for(const p of [Math.floor(value*q),Math.round(value*q),Math.ceil(value*q)]){
    if(Math.abs(p)>maxNumerator)continue;
    const divisor=gcd(p,q),numerator=p/divisor,denominator=q/divisor;
    output.set(`${numerator}/${denominator}`,{p:numerator,q:denominator});
  }
  return [...output.values()].sort((a,b)=>Math.abs(a.p/a.q-value)-Math.abs(b.p/b.q-value)||a.q-b.q);
}
