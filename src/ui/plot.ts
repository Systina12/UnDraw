import type {CandidateResult} from '../core/types';
import type {ViewportTransform} from './viewport';
export function drawFittedPlot(ctx:CanvasRenderingContext2D,result:CandidateResult,view:ViewportTransform,dpr:number):void {
  ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.strokeStyle='#236aa5';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';
  ctx.beginPath();let connected=false;
  for(let i=0;i<result.plot.x.length;i++){
    const x=result.plot.x[i],y=result.plot.y[i];
    if(!Number.isFinite(x)||!Number.isFinite(y)){connected=false;continue;}
    const point=view.worldToScreen(x,y);
    if(connected)ctx.lineTo(point.x,point.y);else ctx.moveTo(point.x,point.y);
    connected=true;
  }
  ctx.stroke();ctx.restore();
}
