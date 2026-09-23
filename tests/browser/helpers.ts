import type {Page} from '@playwright/test';

export async function drawWorldPath(page:Page,points:readonly {x:number;y:number}[]):Promise<void> {
  if(points.length<2)throw new Error('A stroke needs at least two points');
  const canvas=page.locator('canvas[aria-label="Coordinate plane"]');
  const rect=await canvas.boundingBox();
  if(!rect)throw new Error('Coordinate plane is not visible');
  const point=(p:{x:number;y:number})=>({
    x:rect.x+(p.x+5)/10*rect.width,
    y:rect.y+(5-p.y)/10*rect.height,
  });
  const first=point(points[0]);
  await page.mouse.move(first.x,first.y);
  await page.mouse.down();
  for(const sample of points.slice(1)){
    const current=point(sample);
    await page.mouse.move(current.x,current.y);
  }
  await page.mouse.up();
}

export async function drawWorldCurve(page:Page,f:(x:number)=>number,min=-2,max=2):Promise<void> {
  const count=110;
  await drawWorldPath(page,Array.from({length:count},(_,i)=>{
    const x=min+(max-min)*i/(count-1);
    return {x,y:f(x)};
  }));
}
