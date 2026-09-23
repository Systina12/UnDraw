import type {Point} from '../../src/core/types';
export interface StrokeOptions {
  min:number;max:number;noise?:number;seed?:number;count?:number;
  wobble?:number;dropRate?:number;outliers?:number;xJitter?:number;reverse?:boolean;nonuniform?:boolean;
}
export function makeStroke(f:(x:number)=>number,options:StrokeOptions):Point[] {
  let seed=options.seed??1;
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)|0;return (seed>>>0)/4294967296;};
  const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());
  const count=options.count??160;
  const phase=2*Math.PI*random();
  const samples:Point[]=[];
  for(let i=0;i<count;i++){
    if(i>0&&i<count-1&&random()<(options.dropRate??0))continue;
    const unit=i/(count-1);
    const progress=options.nonuniform?unit+.12*Math.sin(2*Math.PI*unit):unit;
    const idealX=options.min+(options.max-options.min)*progress;
    const x=idealX+(i>0&&i<count-1?(options.xJitter??0)*gaussian():0);
    const wobble=(options.wobble??0)*Math.sin(2*Math.PI*1.75*unit+phase);
    samples.push({x,y:f(idealX)+(options.noise??0)*gaussian()+wobble,t:i});
  }
  const positions=new Set<number>();
  const numberOfOutliers=Math.min(options.outliers??0,Math.max(0,samples.length-2));
  while(positions.size<numberOfOutliers)positions.add(1+Math.floor(random()*(samples.length-2)));
  for(const index of positions)samples[index].y+=(random()<.5?-1:1)*Math.max(.12,6*(options.noise??0));
  if(options.reverse)samples.reverse();
  return samples.map((sample,t)=>({...sample,t}));
}
