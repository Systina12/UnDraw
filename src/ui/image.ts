import type {ViewportTransform} from './viewport';
import type {Point} from '../core/types';
import type {EdgeDetail,ImageContour} from '../image/edges';

export interface ImageReference {
  bitmap:ImageBitmap;
  originalBitmap?:ImageBitmap;
  width:number;
  height:number;
  bounds:{xMin:number;xMax:number;yMin:number;yMax:number};
  contours:ImageContour[];
  pixels:Uint8ClampedArray;
}

export async function loadImage(file:File):Promise<ImageReference> {
  if(!['image/png','image/jpeg','image/webp','image/bmp'].includes(file.type)||file.size>12*1024*1024)
    throw new Error('Choose a PNG, JPEG, WebP or BMP image under 12 MB.');
  const source=await createImageBitmap(file);
  try{
    if(source.width<8||source.height<8||source.width>20_000||source.height>20_000||
      source.width*source.height>12_000_000)
      throw new Error('Image must be at least 8 × 8 and no larger than 12 megapixels.');
    const ratio=Math.min(1,900/source.width,900/source.height);
    const width=Math.max(8,Math.round(source.width*ratio));
    const height=Math.max(8,Math.round(source.height*ratio));
    const scratch=document.createElement('canvas');scratch.width=width;scratch.height=height;
    const context=scratch.getContext('2d',{willReadFrequently:true});
    if(!context)throw new Error('Your browser could not read image pixels.');
    context.fillStyle='#fff';context.fillRect(0,0,width,height);
    context.drawImage(source,0,0,width,height);
    const pixels=context.getImageData(0,0,width,height).data;
    const bitmap=await createImageBitmap(scratch);
    // A small preview keeps ordinary canvas redraws fast; zoom uses the source.
    return {bitmap,originalBitmap:source,width,height,pixels,
      bounds:{xMin:0,xMax:source.width,yMin:0,yMax:source.height},
      contours:[]};
  }catch(error){source.close();throw error;}
}

export function imageToWorld(image:ImageReference,x:number,y:number):{x:number;y:number}{
  const {xMin,xMax,yMin,yMax}=image.bounds;
  return {x:xMin+(x+.5)/image.width*(xMax-xMin),
    y:yMax-(y+.5)/image.height*(yMax-yMin)};
}

export function contourToStroke(image:ImageReference,contour:ImageContour):Point[]{
  return contour.points.map(([x,y],t)=>({...imageToWorld(image,x,y),t}));
}

/** Reconnect selected edges when the detector changes its contour numbering. */
export function matchSelectedContours(image:ImageReference,strokes:readonly Point[][]):Map<number,Point[]> {
  const selected=new Map<number,Point[]>();
  if(!strokes.length)return selected;
  const {xMin,xMax,yMin,yMax}=image.bounds;
  const masks=strokes.map(stroke=>{
    const occupied=new Uint8Array(image.width*image.height);
    for(const point of stroke){
    const x=Math.round((point.x-xMin)/(xMax-xMin)*image.width-.5);
    const y=Math.round((yMax-point.y)/(yMax-yMin)*image.height-.5);
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
      if(x+dx>=0&&x+dx<image.width&&y+dy>=0&&y+dy<image.height&&dx*dx+dy*dy<=9)
        occupied[(y+dy)*image.width+x+dx]=1;
    }
    }
    return occupied;
  });
  for(let i=0;i<image.contours.length;i++){
    const points=image.contours[i].points;
    let best=-1,coverage=.6;
    for(let j=0;j<masks.length;j++){
      const covered=points.reduce((count,[x,y])=>count+(masks[j][y*image.width+x]??0),0);
      if(points.length&&covered/points.length>=coverage){best=j;coverage=covered/points.length;}
    }
    if(best>=0)selected.set(i,strokes[best]);
  }
  return selected;
}

export function nearestContour(image:ImageReference,view:ViewportTransform,
  px:number,py:number,excluded:ReadonlySet<number>,radius=15):number {
  let closest=-1,best=radius*radius;
  for(let index=0;index<image.contours.length;index++){
    if(excluded.has(index))continue;
    for(const [x,y] of image.contours[index].points){
      const point=imageToWorld(image,x,y),screen=view.worldToScreen(point.x,point.y);
      const distance=(screen.x-px)**2+(screen.y-py)**2;
      if(distance<best){best=distance;closest=index;}
    }
  }
  return closest;
}

export function paintImage(ctx:CanvasRenderingContext2D,image:ImageReference,view:ViewportTransform,
  dpr:number,selected:ReadonlySet<number>):void {
  const upper=view.worldToScreen(image.bounds.xMin,image.bounds.yMax);
  const lower=view.worldToScreen(image.bounds.xMax,image.bounds.yMin);
  ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.globalAlpha=.34;
  const width=lower.x-upper.x,height=lower.y-upper.y;
  const bitmap=image.originalBitmap&&(width>image.width||height>image.height)?
    image.originalBitmap:image.bitmap;
  ctx.drawImage(bitmap,upper.x,upper.y,width,height);
  ctx.globalAlpha=1;
  ctx.lineWidth=1.5;ctx.lineJoin='round';ctx.lineCap='round';
  for(let i=0;i<image.contours.length;i++){
    if(selected.has(i))continue;
    ctx.strokeStyle='rgba(202,126,24,.78)';ctx.beginPath();
    image.contours[i].points.forEach(([x,y],j)=>{
      const world=imageToWorld(image,x,y),screen=view.worldToScreen(world.x,world.y);
      if(!j)ctx.moveTo(screen.x,screen.y);else ctx.lineTo(screen.x,screen.y);
    });
    ctx.stroke();
  }
  ctx.restore();
}

export function closeImage(image:ImageReference):void {
  image.bitmap.close();
  if(image.originalBitmap&&image.originalBitmap!==image.bitmap)image.originalBitmap.close();
}

export class ImageEdgeClient {
  private worker:Worker|null=null;
  private version=0;
  private rejectPending:((error:Error)=>void)|null=null;
  detect(image:ImageReference,detail:EdgeDetail):Promise<ImageContour[]> {
    this.cancel();const id=this.version;
    return new Promise((resolve,reject)=>{
      this.rejectPending=reject;
      const worker=new Worker(new URL('../worker/image.worker.ts',import.meta.url),{type:'module'});
      this.worker=worker;
      worker.onmessage=(event:MessageEvent<{id:number;contours?:ImageContour[];error?:string}>)=>{
        if(id!==this.version||event.data.id!==id)return;
        this.worker=null;this.rejectPending=null;worker.terminate();
        if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.contours??[]);
      };
      worker.onerror=()=>{
        if(id!==this.version)return;
        this.worker=null;this.rejectPending=null;worker.terminate();reject(new Error('Edge detection failed.'));
      };
      const pixels=new Uint8ClampedArray(image.pixels);
      worker.postMessage({id,width:image.width,height:image.height,pixels,detail},[pixels.buffer]);
    });
  }
  cancel():void{
    this.version++;this.worker?.terminate();this.worker=null;
    this.rejectPending?.(new Error('Edge detection was canceled.'));this.rejectPending=null;
  }
}
