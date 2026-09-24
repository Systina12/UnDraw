import {expect,it,vi} from 'vitest';
import {contourToStroke,imageToWorld,loadImage,nearestContour,
  type ImageReference} from '../../src/ui/image';
import {ViewportTransform} from '../../src/ui/viewport';

it('maps reduced detection pixels to the original image resolution',()=>{
  const image={width:900,height:450,bounds:{xMin:0,xMax:4000,yMin:0,yMax:2000},
    contours:[{length:100,points:[[449.5,224.5]]}]} as ImageReference;
  expect(imageToWorld(image,0,0).x).toBeCloseTo(4000/1800);
  expect(imageToWorld(image,0,0).y).toBeCloseTo(2000-2000/900);
  expect(imageToWorld(image,899,449).x).toBeCloseTo(4000-4000/1800);
  expect(imageToWorld(image,899,449).y).toBeCloseTo(2000/900);
  expect(contourToStroke(image,{length:2,points:[[449.5,224.5]]})[0])
    .toEqual({x:2000,y:1000,t:0});
  const view=new ViewportTransform({xMin:-5,xMax:5,yMin:-5,yMax:5},700,500);
  view.fitImage(4000,2000);
  const selected=view.worldToScreen(2000,1000);
  expect(nearestContour(image,view,selected.x,selected.y,new Set())).toBe(0);
});

it('keeps source image dimensions when detection reduces a large bitmap',async()=>{
  const source={width:4000,height:2000,close:vi.fn()} as unknown as ImageBitmap;
  const preview={width:900,height:450,close:vi.fn()} as unknown as ImageBitmap;
  vi.stubGlobal('createImageBitmap',vi.fn(async(input:File|HTMLCanvasElement)=>
    input instanceof File?source:preview));
  const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({
    fillRect:vi.fn(),drawImage:vi.fn(),getImageData:()=>({
      data:new Uint8ClampedArray(900*450*4),
    }),
  } as unknown as CanvasRenderingContext2D);
  try{
    const image=await loadImage(new File(['test'],'graph.png',{type:'image/png'}));
    expect(image.width).toBe(900);
    expect(image.height).toBe(450);
    expect(image.bounds).toEqual({xMin:0,xMax:4000,yMin:0,yMax:2000});
    expect(source.close).toHaveBeenCalledOnce();
    expect(imageToWorld(image,449.5,224.5)).toEqual({x:2000,y:1000});
    image.bitmap.close();
  }finally{context.mockRestore();vi.unstubAllGlobals();}
});
