/** Pixel-space contours. Points stay in traversal order so the existing stroke solver can use them. */
export interface ImageContour {points:[number,number][];length:number}
export type EdgeDetail='low'|'normal'|'high';
import {centerlineContours,traceMask} from './centerline';

const directions=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]] as const;

function uniqueContours(contours:ImageContour[],width:number,height:number):ImageContour[] {
  const occupied=new Uint8Array(width*height),result:ImageContour[]=[];
  for(const contour of contours){
    const coverage=contour.points.reduce((count,[x,y])=>count+occupied[y*width+x],0);
    if(coverage/contour.points.length>.8)continue;
    result.push(contour);
    for(const [x,y] of contour.points)for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      if(dx*dx+dy*dy>5||x+dx<0||y+dy<0||x+dx>=width||y+dy>=height)continue;
      occupied[(y+dy)*width+x+dx]=1;
    }
    if(result.length>=120)break;
  }
  return result;
}

export function detectEdges(pixels:Uint8ClampedArray,width:number,height:number,
  detail:EdgeDetail='normal'):ImageContour[] {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<8||height<8||
    width*height>1_000_000||pixels.length!==width*height*4)throw new RangeError('Invalid image size');
  const centerlines=centerlineContours(pixels,width,height,detail);
  const count=width*height;
  const gray=new Float32Array(count),blur=new Float32Array(count),magnitude=new Float32Array(count);
  const angle=new Uint8Array(count);
  for(let i=0;i<count;i++){
    // Transparent pixels are composited over white, including transparent PNG screenshots.
    const alpha=pixels[4*i+3]/255;
    gray[i]=(pixels[4*i]*.2126+pixels[4*i+1]*.7152+pixels[4*i+2]*.0722)*alpha+
      255*(1-alpha);
  }
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;
    blur[i]=(gray[i-width-1]+2*gray[i-width]+gray[i-width+1]+2*gray[i-1]+4*gray[i]+
      2*gray[i+1]+gray[i+width-1]+2*gray[i+width]+gray[i+width+1])/16;
  }
  const strengths:number[]=[];
  for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
    const i=y*width+x;
    const gx=-blur[i-width-1]+blur[i-width+1]-2*blur[i-1]+2*blur[i+1]-
      blur[i+width-1]+blur[i+width+1];
    const gy=-blur[i-width-1]-2*blur[i-width]-blur[i-width+1]+
      blur[i+width-1]+2*blur[i+width]+blur[i+width+1];
    const value=Math.hypot(gx,gy);
    magnitude[i]=value;
    if(value>25)strengths.push(value);
    const degrees=(Math.atan2(gy,gx)*180/Math.PI+180)%180;
    angle[i]=Math.round(degrees/45)%4;
  }
  if(strengths.length<12)return uniqueContours(centerlines,width,height);
  strengths.sort((a,b)=>a-b);
  const high=Math.max(32,strengths[Math.floor(strengths.length*.8)]*
    ({low:.75,normal:.5,high:.3}[detail]));
  const low=high*.45;
  const thin=new Uint8Array(count),edges=new Uint8Array(count),queue:number[]=[];
  for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
    const i=y*width+x,v=magnitude[i];
    if(v<low)continue;
    const offset=[1,width+1,width,width-1][angle[i]];
    if(v>=magnitude[i-offset]&&v>magnitude[i+offset]){
      thin[i]=1;
      if(v>=high){edges[i]=1;queue.push(i);}
    }
  }
  for(let head=0;head<queue.length;head++){
    const i=queue[head],x=i%width,y=Math.floor(i/width);
    for(const [dx,dy] of directions){
      const nx=x+dx,ny=y+dy;
      if(nx<1||ny<1||nx>=width-1||ny>=height-1)continue;
      const next=ny*width+nx;
      if(thin[next]&&!edges[next]){edges[next]=1;queue.push(next);}
    }
  }
  const gradientContours=traceMask(edges,width,height);
  return uniqueContours([...centerlines,...gradientContours],width,height);
}
