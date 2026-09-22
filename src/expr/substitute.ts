import {type Expr,type VariableName} from './ast';
export function substituteVariable(expr:Expr,name:VariableName,replacement:Expr):Expr {
  switch(expr.kind){
    case 'var':return expr.name===name?replacement:expr;
    case 'const':return expr;
    case 'add':case 'mul':return {kind:expr.kind,args:expr.args.map(child=>substituteVariable(child,name,replacement))};
    case 'div':return {kind:'div',a:substituteVariable(expr.a,name,replacement),b:substituteVariable(expr.b,name,replacement)};
    case 'pow':return {kind:'pow',base:substituteVariable(expr.base,name,replacement),exponent:substituteVariable(expr.exponent,name,replacement)};
    default:return {...expr,arg:substituteVariable(expr.arg,name,replacement)};
  }
}
