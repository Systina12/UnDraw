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
