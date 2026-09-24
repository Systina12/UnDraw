import {expect,it} from 'vitest';
import {detectEdges} from '../../src/image/edges';

function image(width:number,height:number,curve:(x:number)=>number):Uint8ClampedArray{
  const pixels=new Uint8ClampedArray(width*height*4);pixels.fill(255);
  for(let x=15;x<width-15;x++){
    const y=Math.round(curve(x));
    for(let offset=-1;offset<=1;offset++){
      const i=4*((y+offset)*width+x);
      pixels[i]=pixels[i+1]=pixels[i+2]=0;
    }
  }
  return pixels;
}

it('traces a drawn curve in order and discards an empty background',()=>{
  const width=240,height=160;
  const contours=detectEdges(image(width,height,x=>80+28*Math.sin(x/27)),width,height);
  expect(contours.length).toBeGreaterThan(0);
  const long=contours.find(contour=>{
    const xs=contour.points.map(point=>point[0]);
    return Math.max(...xs)-Math.min(...xs)>140;
  });
  expect(long).toBeDefined();
  expect(long!.points.length).toBeGreaterThan(40);
  for(let i=1;i<long!.points.length;i++)
    expect(Math.hypot(long!.points[i][0]-long!.points[i-1][0],
      long!.points[i][1]-long!.points[i-1][1])).toBeLessThan(2);
  const blank=new Uint8ClampedArray(width*height*4);blank.fill(255);
  expect(detectEdges(blank,width,height)).toEqual([]);
});

it('rejects malformed and oversized images before allocating edge buffers',()=>{
  expect(()=>detectEdges(new Uint8ClampedArray(10),200,120)).toThrow(RangeError);
  expect(()=>detectEdges(new Uint8ClampedArray(1),2000,2000)).toThrow(RangeError);
});

function paint(pixels:Uint8ClampedArray,width:number,x:number,y:number,radius:number,
  rgb:readonly [number,number,number]):void{
  const height=pixels.length/4/width;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    if(dx*dx+dy*dy>radius*radius||x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
    const i=4*((y+dy)*width+x+dx);
    pixels[i]=rgb[0];pixels[i+1]=rgb[1];pixels[i+2]=rgb[2];
  }
}

function match(contours:ReturnType<typeof detectEdges>,minSpan:number,
  curve:(x:number)=>number):number{
  return Math.min(...contours.filter(contour=>{
    const xs=contour.points.map(([x])=>x);
    return Math.max(...xs)-Math.min(...xs)>minSpan;
  }).map(contour=>contour.points.reduce((sum,[x,y])=>sum+Math.abs(y-curve(x)),0)/
    contour.points.length));
}

it('follows colored graph curves across neutral axes and grid lines',()=>{
  const width=300,height=210,pixels=new Uint8ClampedArray(width*height*4);pixels.fill(255);
  for(let x=20;x<width-10;x+=25)for(let y=10;y<height-10;y++)
    paint(pixels,width,x,y,0,[223,226,228]);
  for(let y=15;y<height-10;y+=25)for(let x=10;x<width-10;x++)
    paint(pixels,width,x,y,0,[223,226,228]);
  for(let y=10;y<height-10;y++)paint(pixels,width,145,y,0,[60,60,60]);
  const curve=(x:number)=>105+28*Math.sin(x/32);
  for(let x=15;x<width-15;x++)paint(pixels,width,x,Math.round(curve(x)),2,[36,91,218]);
  const contours=detectEdges(pixels,width,height);
  expect(match(contours,200,curve)).toBeLessThan(2.5);
});

it('returns the center of a thick monochrome stroke, including through an axis crossing',()=>{
  const width=260,height=190,pixels=new Uint8ClampedArray(width*height*4);pixels.fill(255);
  for(let y=5;y<height-5;y++)paint(pixels,width,130,y,0,[170,170,170]);
  const curve=(x:number)=>95+.45*(x-130);
  for(let x=15;x<width-15;x++)paint(pixels,width,x,Math.round(curve(x)),5,[20,20,20]);
  const contours=detectEdges(pixels,width,height);
  expect(match(contours,180,curve)).toBeLessThan(2);
});

it('connects short dashes that follow one curve without joining two crossing colors',()=>{
  const width=280,height=190,pixels=new Uint8ClampedArray(width*height*4);pixels.fill(255);
  const red=(x:number)=>41+.38*x;
  const blue=(x:number)=>158-.38*x;
  for(let x=15;x<width-15;x++){
    if(x%11<7)paint(pixels,width,x,Math.round(red(x)),2,[215,47,48]);
    paint(pixels,width,x,Math.round(blue(x)),2,[32,102,209]);
  }
  const contours=detectEdges(pixels,width,height);
  expect(match(contours,170,red)).toBeLessThan(2.5);
  expect(match(contours,170,blue)).toBeLessThan(2.5);
});

it('finds light and colored traces on a dark graph background',()=>{
  const width=240,height=160,pixels=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<pixels.length;i+=4){
    pixels[i]=20;pixels[i+1]=30;pixels[i+2]=42;pixels[i+3]=255;
  }
  const curve=(x:number)=>80+24*Math.cos(x/26);
  for(let x=12;x<width-12;x++)paint(pixels,width,x,Math.round(curve(x)),2,[129,218,158]);
  expect(match(detectEdges(pixels,width,height),160,curve)).toBeLessThan(2.5);
});

it('keeps two separate long line segments apart when the blank gap has no ink',()=>{
  const width=240,height=160,pixels=new Uint8ClampedArray(width*height*4);pixels.fill(255);
  for(let x=20;x<=113;x++)paint(pixels,width,x,80,2,[15,15,15]);
  for(let x=122;x<=215;x++)paint(pixels,width,x,80,2,[15,15,15]);
  const contours=detectEdges(pixels,width,height);
  expect(contours.some(contour=>{
    const xs=contour.points.map(([x])=>x);
    return Math.max(...xs)-Math.min(...xs)>160&&
      contour.points.every(([,y])=>Math.abs(y-80)<3);
  })).toBe(false);
});
