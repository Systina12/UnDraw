import type {ImageContour} from './edges';

const offsets=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]] as const;

/** Preserve path order at forks by continuing in the direction of travel. */
export function traceMask(mask:Uint8Array,width:number,height:number,minimum?:number):ImageContour[] {
  const active:number[]=[],degree=new Uint8Array(mask.length),visited=new Uint8Array(mask.length);
  const neighbors=(i:number):[number,number][]=>{
    const x=i%width,y=Math.floor(i/width),result:[number,number][]=[];
    for(let direction=0;direction<8;direction++){
      const [dx,dy]=offsets[direction],nx=x+dx,ny=y+dy;
      if(nx<=0||ny<=0||nx>=width-1||ny>=height-1)continue;
      const next=ny*width+nx;
      if(!mask[next])continue;
      if(dx&&dy&&(mask[y*width+nx]||mask[ny*width+x]))continue;
      result.push([next,direction]);
    }
    return result;
  };
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;
    if(mask[i]){active.push(i);degree[i]=neighbors(i).length;}
  }
  const contours:ImageContour[]=[],minLength=minimum??Math.max(14,Math.min(width,height)*.055);
  const trace=(start:number,next:number,direction:number)=>{
    const indices=[start];let previous=start,current=next,heading=direction;
    while(true){
      visited[previous]|=1<<heading;visited[current]|=1<<(7-heading);
      indices.push(current);
      if(current===start||indices.length>mask.length)break;
      const options=neighbors(current).filter(([index,dir])=>index!==previous&&
        !(visited[current]&(1<<dir)));
      if(!options.length)break;
      const vx=current%width-previous%width;
      const vy=Math.floor(current/width)-Math.floor(previous/width);
      options.sort((a,b)=>{
        const da=offsets[a[1]],db=offsets[b[1]];
        return (vx*db[0]+vy*db[1])/Math.hypot(db[0],db[1])-
          (vx*da[0]+vy*da[1])/Math.hypot(da[0],da[1]);
      });
      const [following,dir]=options[0],step=offsets[dir];
      if(degree[current]>2&&(vx*step[0]+vy*step[1])/
        (Math.hypot(vx,vy)*Math.hypot(step[0],step[1]))<.35)break;
      previous=current;current=following;heading=dir;
    }
    if(indices.length<Math.max(4,Math.ceil(minLength/2)))return;
    let length=0,minX=width,maxX=0,minY=height,maxY=0;
    const points=indices.map((index,i)=>{
      const x=index%width,y=Math.floor(index/width);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      if(i)length+=Math.hypot(x-indices[i-1]%width,y-Math.floor(indices[i-1]/width));
      return [x,y] as [number,number];
    });
    if(length<minLength||Math.max(maxX-minX,maxY-minY)<minLength*.6)return;
    contours.push({points:points.length>700?Array.from({length:700},(_,i)=>
      points[Math.round(i*(points.length-1)/699)]):points,length});
  };
  for(const desired of [1,3,2,0])for(const i of active){
    if(desired===3?degree[i]<=2:degree[i]!==desired)continue;
    for(const [next,dir] of neighbors(i))if(!(visited[i]&(1<<dir)))trace(i,next,dir);
  }
  return contours.sort((a,b)=>b.length-a.length);
}

/** Zhang–Suen thinning turns a filled ink stroke into a one-pixel center path. */
function thin(mask:Uint8Array,width:number,height:number):void {
  for(let iteration=0;iteration<14;iteration++){
    let removed=0;
    for(let pass=0;pass<2;pass++){
      const erase:number[]=[];
      for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
        const i=y*width+x;if(!mask[i])continue;
        const p=[mask[i-width],mask[i-width+1],mask[i+1],mask[i+width+1],
          mask[i+width],mask[i+width-1],mask[i-1],mask[i-width-1]];
        const count=p.reduce<number>((sum,v)=>sum+v,0);
        if(count<2||count>6)continue;
        let transitions=0;
        for(let j=0;j<8;j++)if(!p[j]&&p[(j+1)%8])transitions++;
        if(transitions!==1)continue;
        if(pass===0?(p[0]&&p[2]&&p[4])||(p[2]&&p[4]&&p[6]):
          (p[0]&&p[2]&&p[6])||(p[0]&&p[4]&&p[6]))continue;
        erase.push(i);
      }
      for(const index of erase)mask[index]=0;
      removed+=erase.length;
    }
    if(!removed)break;
  }
}

function backgroundColor(pixels:Uint8ClampedArray):[number,number,number]|null {
  const bins=new Uint32Array(4096);
  let winner=0;
  for(let i=0;i<pixels.length;i+=4){
    const bin=(pixels[i]>>4)*256+(pixels[i+1]>>4)*16+(pixels[i+2]>>4);
    if(++bins[bin]>bins[winner])winner=bin;
  }
  if(bins[winner]<pixels.length/4*.2)return null;
  const sums=[0,0,0];
  for(let i=0;i<pixels.length;i+=4)
    if((pixels[i]>>4)*256+(pixels[i+1]>>4)*16+(pixels[i+2]>>4)===winner){
      sums[0]+=pixels[i];sums[1]+=pixels[i+1];sums[2]+=pixels[i+2];
    }
  return sums.map(value=>value/bins[winner]) as [number,number,number];
}

function hueGroup(r:number,g:number,b:number):number {
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  if(d===0)return 0;
  const hue=max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  return Math.floor(hue)%6;
}

function joinSmoothGaps(input:ImageContour[],mask:Uint8Array,width:number,height:number):ImageContour[] {
  const contours=[...input];
  const limit=Math.max(8,Math.min(16,Math.min(width,height)*.06));
  const dashed=input.length>=4&&input.filter(contour=>contour.length<Math.max(18,width*.08))
    .length>input.length/2;
  const direction=(points:[number,number][],atEnd:boolean):[number,number]=>{
    const first=atEnd?points[Math.max(0,points.length-6)]:points[Math.min(5,points.length-1)];
    const last=atEnd?points.at(-1)!:points[0];
    const dx=last[0]-first[0],dy=last[1]-first[1],size=Math.hypot(dx,dy)||1;
    return [dx/size,dy/size];
  };
  for(let iteration=0;iteration<input.length;iteration++){
    let best:{a:number;b:number;reverseA:boolean;reverseB:boolean;gap:number}|null=null;
    for(let a=0;a<contours.length;a++)for(let b=a+1;b<contours.length;b++){
      for(const reverseA of [false,true])for(const reverseB of [false,true]){
        const left=contours[a].points,right=contours[b].points;
        const end=reverseA?left[0]:left.at(-1)!,start=reverseB?right.at(-1)!:right[0];
        const dx=start[0]-end[0],dy=start[1]-end[1],gap=Math.hypot(dx,dy);
        if(gap<1||gap>limit||best&&gap>=best.gap)continue;
        if(!dashed&&gap>3&&left.length>16&&right.length>16){
          let bridgeSupported=false;
          for(let step=1;step<Math.ceil(gap);step++){
            const x=Math.round(end[0]+dx*step/Math.ceil(gap));
            const y=Math.round(end[1]+dy*step/Math.ceil(gap));
            if(mask[y*width+x]){bridgeSupported=true;break;}
          }
          if(!bridgeSupported)continue;
        }
        const u=direction(left,!reverseA),back=direction(right,reverseB);
        const v:[number,number]=[-back[0],-back[1]];
        if(u[0]*v[0]+u[1]*v[1]<.83)continue;
        if(gap>2&&Math.min((u[0]*dx+u[1]*dy)/gap,(v[0]*dx+v[1]*dy)/gap)<.68)continue;
        best={a,b,reverseA,reverseB,gap};
      }
    }
    if(!best)break;
    const left=best.reverseA?[...contours[best.a].points].reverse():contours[best.a].points;
    const right=best.reverseB?[...contours[best.b].points].reverse():contours[best.b].points;
    const start=left.at(-1)!,end=right[0],gap=Math.ceil(best.gap);
    const bridge=Array.from({length:Math.max(0,gap-1)},(_,i)=>[
      Math.round(start[0]+(end[0]-start[0])*(i+1)/gap),
      Math.round(start[1]+(end[1]-start[1])*(i+1)/gap)] as [number,number]);
    const points=[...left,...bridge,...right];
    contours[best.a]={points:points.length>700?Array.from({length:700},(_,i)=>
      points[Math.round(i*(points.length-1)/699)]):points,
      length:contours[best.a].length+contours[best.b].length+best.gap};
    contours.splice(best.b,1);
  }
  return contours;
}

export function centerlineContours(pixels:Uint8ClampedArray,width:number,height:number,
  detail:'low'|'normal'|'high'):ImageContour[] {
  const background=backgroundColor(pixels);
  if(!background)return [];
  const mask=new Uint8Array(width*height);
  const colorMasks=Array.from({length:6},()=>new Uint8Array(mask.length));
  let foreground=0,colored=0;
  const threshold={low:55,normal:35,high:22}[detail];
  for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
    const i=y*width+x,p=4*i,r=pixels[p],g=pixels[p+1],b=pixels[p+2];
    const distance=Math.hypot(r-background[0],g-background[1],b-background[2])/Math.sqrt(3);
    if(distance<threshold)continue;
    mask[i]=1;foreground++;
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    if(max-min>=42&&(max-min)/Math.max(max,1)>.3){
      colorMasks[hueGroup(r,g,b)][i]=1;colored++;
    }
  }
  const colorContours:ImageContour[]=[];
  if(colored>14&&colored<mask.length*.12){
    for(const group of colorMasks){
      thin(group,width,height);
      colorContours.push(...joinSmoothGaps(traceMask(group,width,height,3).slice(0,200),
        group,width,height));
    }
  }
  const inkContours:ImageContour[]=[];
  if(foreground>14&&foreground<mask.length*.23){
    thin(mask,width,height);
    inkContours.push(...joinSmoothGaps(traceMask(mask,width,height,5).slice(0,200),
      mask,width,height));
  }
  const minimum=Math.max(14,Math.min(width,height)*.055);
  const byLength=(a:ImageContour,b:ImageContour)=>b.length-a.length;
  return [...colorContours.filter(contour=>contour.length>=minimum).sort(byLength),
    ...inkContours.filter(contour=>contour.length>=minimum).sort(byLength)];
}
