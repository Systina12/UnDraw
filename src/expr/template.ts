import type {Constant,VariableName} from './ast';
export type TemplateExpr =
  | {kind:'var';name:VariableName}
  | {kind:'param';id:number}
  | {kind:'const';value:Constant}
  | {kind:'add'|'mul';args:TemplateExpr[]}
  | {kind:'div';a:TemplateExpr;b:TemplateExpr}
  | {kind:'pow';base:TemplateExpr;exponent:TemplateExpr}
  | {kind:'sin'|'cos'|'exp'|'log'|'abs'|'sqrt';arg:TemplateExpr};

export function countParams(expr:TemplateExpr):number {
  let highest=-1;
  const visit=(node:TemplateExpr):void=>{
    if(node.kind==='param')highest=Math.max(highest,node.id);
    else if(node.kind==='add'||node.kind==='mul')node.args.forEach(visit);
    else if(node.kind==='div'){visit(node.a);visit(node.b);}
    else if(node.kind==='pow'){visit(node.base);visit(node.exponent);}
    else if('arg' in node)visit(node.arg);
  };
  visit(expr);return highest+1;
}
