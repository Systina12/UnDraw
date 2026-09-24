/** Pixel-space contours. Points stay in traversal order so the existing stroke solver can use them. */
export interface ImageContour {points:[number,number][];length:number}
export type EdgeDetail='low'|'normal'|'high';

const directions=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]] as const;

export function detectEdges(pixels:Uint8ClampedArray,width:number,height:number,
  detail:EdgeDetail='normal'):ImageContour[] {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<8||height<8||
    width*height>1_000_000||pixels.length!==width*height*4)throw new RangeError('Invalid image size');
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
  if(strengths.length<12)return [];
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
  const adjacent=(index:number):[number,number][]=>{
    const x=index%width,y=Math.floor(index/width),result:[number,number][]=[];
    for(let direction=0;direction<8;direction++){
      const [dx,dy]=directions[direction],nx=x+dx,ny=y+dy;
      if(nx<1||ny<1||nx>=width-1||ny>=height-1)continue;
      const next=ny*width+nx;
      if(!edges[next])continue;
      // A diagonal between two already connected orthogonal pixels is an artificial fork.
      if(dx&&dy&&(edges[y*width+nx]||edges[ny*width+x]))continue;
      result.push([next,direction]);
    }
    return result;
  };
  const visited=new Uint8Array(count),degree=new Uint8Array(count);
  for(const i of queue)degree[i]=adjacent(i).length;
  const contours:ImageContour[]=[];
  const minLength=Math.max(14,Math.min(width,height)*.055);
  const trace=(start:number,next:number,direction:number)=>{
    const path=[start];
    let previous=start,current=next,dir=direction;
    while(true){
      visited[previous]|=1<<dir;visited[current]|=1<<(7-dir);
      path.push(current);
      if(current===start||degree[current]!==2)break;
      const following=adjacent(current).find(([index,d])=>index!==previous&&!(visited[current]&(1<<d)));
      if(!following)break;
      previous=current;[current,dir]=following;
    }
    if(path.length<12)return;
    let length=0,minX=width,maxX=0,minY=height,maxY=0;
    const points=path.map((index,i)=>{
      const x=index%width,y=Math.floor(index/width);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      if(i)length+=Math.hypot(x-path[i-1]%width,y-Math.floor(path[i-1]/width));
      return [x,y] as [number,number];
    });
    if(length<minLength||Math.max(maxX-minX,maxY-minY)<minLength*.6)return;
    if(points.length>700){
      const sampled=Array.from({length:700},(_,i)=>points[Math.round(i*(points.length-1)/699)]);
      contours.push({points:sampled,length});
    }else contours.push({points,length});
  };
  // Endpoints and intersections first, then closed contours with no endpoints.
  for(const i of queue)if(degree[i]!==2)for(const [next,dir] of adjacent(i))
    if(!(visited[i]&(1<<dir)))trace(i,next,dir);
  for(const i of queue)if(degree[i]===2)for(const [next,dir] of adjacent(i))
    if(!(visited[i]&(1<<dir)))trace(i,next,dir);
  return contours.sort((a,b)=>b.length-a.length).slice(0,120);
}
