import type {CandidateResult} from '../core/types';
import type {ViewportTransform} from './viewport';
export function drawFittedPlot(ctx:CanvasRenderingContext2D,result:CandidateResult,view:ViewportTransform,dpr:number,
  color='#236aa5'):void {
  ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';
  ctx.setLineDash([7,5]);
  ctx.beginPath();ctx.rect(0,0,view.width,view.height);ctx.clip();
  ctx.beginPath();let connected=false;
  // Merged strokes contain separate sample islands. Never draw across their unknown intervals.
  const xs=result.plot.x;
  const steps=result.parametric?[]:xs.slice(1).map((x,i)=>x-xs[i]).filter(dx=>Number.isFinite(dx)&&dx>0)
    .sort((a,b)=>a-b);
  const typicalStep=steps.length?steps[Math.floor(steps.length/2)]:Infinity;
  let previous:{x:number;y:number}|null=null;
  for(let i=0;i<result.plot.x.length;i++){
    const x=result.plot.x[i],y=result.plot.y[i];
    if(!Number.isFinite(x)||!Number.isFinite(y)){connected=false;previous=null;continue;}
    const point=view.worldToScreen(x,y);
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y)){connected=false;previous=null;continue;}
    if(i>0&&!result.parametric&&x-xs[i-1]>4*typicalStep)connected=false;
    if(previous&&Math.abs(point.y-previous.y)>2*view.height)connected=false;
    if(connected)ctx.lineTo(point.x,point.y);else ctx.moveTo(point.x,point.y);
    previous=point;connected=true;
  }
  ctx.stroke();ctx.restore();
}
