import {type Expr} from './ast';
export function structuralHash(expr:Expr):string { return JSON.stringify(expr); }

export function canonicalize(expr:Expr):Expr {
  switch(expr.kind){
    case 'add':case 'mul': {
      const args=expr.args.map(canonicalize).flatMap(child=>child.kind===expr.kind?child.args:[child]);
      args.sort((a,b)=>structuralHash(a).localeCompare(structuralHash(b)));
      return {kind:expr.kind,args};
    }
    case 'div':return {kind:'div',a:canonicalize(expr.a),b:canonicalize(expr.b)};
    case 'pow':return {kind:'pow',base:canonicalize(expr.base),exponent:canonicalize(expr.exponent)};
    case 'var':case 'const':return expr;
    default:return {...expr,arg:canonicalize(expr.arg)};
  }
}
