import type {Expr} from './ast';
export function operatorComplexity(expr:Expr):number {
  switch(expr.kind){
    case 'var':case 'const':return 0;
    case 'add':case 'mul':return Math.max(0,expr.args.length-1)+expr.args.reduce((n,arg)=>n+operatorComplexity(arg),0);
    case 'div':return 2+operatorComplexity(expr.a)+operatorComplexity(expr.b);
    case 'pow':return 1+operatorComplexity(expr.base)+operatorComplexity(expr.exponent);
    default:return (expr.kind==='exp'||expr.kind==='log'?3:expr.kind==='sqrt'?2:expr.kind==='sin'||expr.kind==='cos'||expr.kind==='tanh'?2:1)+operatorComplexity(expr.arg);
  }
}
