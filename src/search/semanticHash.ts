import type {Expr} from '../expr/ast';
import {evaluate} from '../expr/evaluate';

export function semanticSignature(expr:Expr):string|null {
  const samples:number[]=[];
  for(let i=0;i<32;i++){
    const u=-1+2*i/31,result=evaluate(expr,u);
    if(!result.valid)return null;
    samples.push(result.value);
  }
  const mean=samples.reduce((a,b)=>a+b,0)/samples.length;
  const deviation=Math.sqrt(samples.reduce((a,b)=>a+(b-mean)**2,0)/samples.length);
  if(deviation<1e-10)return `constant:${Math.round(mean*1000)}`;
  const sign=samples.find(v=>Math.abs(v-mean)>1e-8)!>mean?1:-1;
  const normalized=samples.map(v=>Math.round((v-mean)/deviation*sign*1000)).join(',');
  const mask=(1n<<64n)-1n;
  let a=14695981039346656037n,b=7809847782465536322n;
  for(let i=0;i<normalized.length;i++){
    const code=BigInt(normalized.charCodeAt(i));
    a=((a^code)*1099511628211n)&mask;
    b=((b^(code+17n))*1099511628211n)&mask;
  }
  return `${a.toString(16)}:${b.toString(16)}`;
}
