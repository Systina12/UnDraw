import {type Expr,constant,integer,variable,add,mul,numericConstant} from '../expr/ast';
import type {TemplateExpr} from '../expr/template';
import {countParams} from '../expr/template';
import type {CurveData} from '../core/normalize';
import type {CandidateDraft} from './producer';
import {projectLinear,draft} from '../models/shared';
import {fitLm} from '../math/lm';
import {simplify} from '../expr/simplify';

export {countParams};
function canonical(node:TemplateExpr):TemplateExpr{
  if(node.kind==='add'||node.kind==='mul'){
    const args=node.args.map(canonical).flatMap(child=>child.kind===node.kind?child.args:[child]);
    args.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return {kind:node.kind,args};
  }
  if(node.kind==='div')return {kind:'div',a:canonical(node.a),b:canonical(node.b)};
  if(node.kind==='pow')return {kind:'pow',base:canonical(node.base),exponent:canonical(node.exponent)};
  if('arg' in node)return {...node,arg:canonical(node.arg)};
  return node;
}
export function templateHash(node:TemplateExpr):string{return JSON.stringify(canonical(node));}

export function enumerateGrammar(level:number,byLevel:Map<number,TemplateExpr[]>,capacity=300):TemplateExpr[]{
  if(level===0)return byLevel.get(0)??[{kind:'var',name:'x'}];
  const generated:TemplateExpr[]=[];
  const unary:[TemplateExpr['kind'],number][]=[['abs',1],['sqrt',2],['sin',2],['cos',2],['exp',3],['log',3]];
  for(const [kind,cost] of unary){
    for(const child of (byLevel.get(level-cost)??[]).slice(0,40)){
      if(child.kind===kind||kind==='exp'&&child.kind==='log'||kind==='log'&&child.kind==='exp')continue;
      const arg=kind==='log'||kind==='sqrt'?{kind:'abs',arg:child} as TemplateExpr:child;
      generated.push({kind:kind as 'sin',arg});
    }
  }
  for(const child of (byLevel.get(level-1)??[]).slice(0,30))for(const exponent of [-3,-2,2,3,4]){
    if(child.kind==='pow')continue;
    generated.push({kind:'pow',base:child,exponent:{kind:'const',value:{kind:'integer',value:exponent}}});
  }
  for(const [kind,cost] of [['add',1],['mul',1],['div',2]] as const){
    for(let i=0;i<=level-cost;i++){
      const left=(byLevel.get(i)??[]).slice(0,12),right=(byLevel.get(level-cost-i)??[]).slice(0,12);
      for(const a of left)for(const b of right){
        if(kind!=='div'&&templateHash(a)===templateHash(b))continue;
        if(kind==='div')generated.push({kind,a,b});
        else generated.push({kind,args:[a,b]});
      }
    }
  }
  const unique=new Map<string,TemplateExpr>();
  for(const item of generated){const normalized=canonical(item);unique.set(templateHash(normalized),normalized);if(unique.size>=capacity)break;}
  return [...unique.values()];
}

export function parameterizeShape(shape:TemplateExpr):TemplateExpr {
  const param=(id:number):TemplateExpr=>({kind:'param',id});
  const inner=shape.kind==='sin'||shape.kind==='cos'?
    {...shape,arg:{kind:'add',args:[{kind:'mul',args:[param(2),shape.arg]},param(3)]} as TemplateExpr}:shape;
  return {kind:'add',args:[{kind:'mul',args:[param(0),inner]},param(1)]};
}

function value(expr:TemplateExpr,u:number,p:ArrayLike<number>):number{
  switch(expr.kind){
    case 'var':return u;
    case 'param':return p[expr.id];
    case 'const':return numericConstant(expr.value);
    case 'add':return expr.args.reduce((s,e)=>s+value(e,u,p),0);
    case 'mul':return expr.args.reduce((s,e)=>s*value(e,u,p),1);
    case 'div':{const b=value(expr.b,u,p);return Math.abs(b)<1e-6?NaN:value(expr.a,u,p)/b;}
    case 'pow':return Math.pow(value(expr.base,u,p),value(expr.exponent,u,p));
    case 'sin':return Math.sin(value(expr.arg,u,p));
    case 'cos':return Math.cos(value(expr.arg,u,p));
    case 'exp':{const v=value(expr.arg,u,p);return Math.abs(v)<=30?Math.exp(v):NaN;}
    case 'log':{const v=value(expr.arg,u,p);return v>0?Math.log(v):NaN;}
    case 'sqrt':{const v=value(expr.arg,u,p);return v>=0?Math.sqrt(v):NaN;}
    case 'abs':return Math.abs(value(expr.arg,u,p));
  }
}
function materialize(expr:TemplateExpr,p:ArrayLike<number>,u:Expr):Expr{
  switch(expr.kind){
    case 'var':return u;
    case 'param':return constant(p[expr.id]);
    case 'const':return {kind:'const',value:expr.value};
    case 'add':return add(...expr.args.map(e=>materialize(e,p,u)));
    case 'mul':return mul(...expr.args.map(e=>materialize(e,p,u)));
    case 'div':return {kind:'div',a:materialize(expr.a,p,u),b:materialize(expr.b,p,u)};
    case 'pow':return {kind:'pow',base:materialize(expr.base,p,u),exponent:materialize(expr.exponent,p,u)};
    default:return {...expr,arg:materialize(expr.arg,p,u)};
  }
}
export function fitTemplate(template:TemplateExpr,data:CurveData):CandidateDraft|null{
  const parameters=countParams(template);
  if(parameters>8||parameters<2)return null;
  let fitted:Float64Array|null=null;
  if(parameters===2){
    const shape=(template.kind==='add'&&template.args[0].kind==='mul')?template.args[0].args[1]:null;
    if(!shape)return null;
    const projection=projectLinear(data,u=>[value(shape,u,[]),1]);
    if(!projection)return null;
    fitted=projection.coefficients;
  }else{
    let bestLoss=Infinity;
    for(const omega of [0.5,1,2,4,6,-2])for(const phase of [0,Math.PI/2]){
      const initial=Float64Array.from([1,0,omega,phase]);
      const result=fitLm((p,u)=>value(template,u,p),data.v,initial,{x:data.u,delta:Math.max(.01,1.5*data.sigmaDraw/data.normalization.ys),maxIterations:35});
      if(result.loss<bestLoss){bestLoss=result.loss;fitted=result.params;}
    }
  }
  if(!fitted)return null;
  const {xc,xs,yc,ys}=data.normalization;
  const u=simplify(mul(add(variable(),constant(-xc)),constant(1/xs)));
  const expr=simplify(add(mul(constant(ys),materialize(template,fitted,u)),constant(yc)));
  return draft(expr,'symbolic',parameters);
}
