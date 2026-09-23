import {test,expect} from '@playwright/test';
import {drawWorldCurve} from './helpers';

test.use({hasTouch:true,isMobile:true,viewport:{width:420,height:760}});

test('two-finger navigation preserves a result and leaves the next touch free to draw',async({page,context})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await drawWorldCurve(page,x=>x);
  await page.getByRole('button',{name:'Find functions'}).click();
  const formula=page.getByTestId('formula');
  await expect(formula).toContainText('x');
  const before=await page.locator('[data-plain]').textContent();
  const box=await page.locator('canvas').boundingBox();
  if(!box)throw new Error('Missing coordinate plane');
  const cdp=await context.newCDPSession(page);
  const touch=(type:'touchStart'|'touchMove'|'touchEnd',touchPoints:{x:number;y:number;id:number}[])=>(
    cdp.send('Input.dispatchTouchEvent',{type,touchPoints}));
  const centerY=box.y+box.height/2;
  await touch('touchStart',[{x:box.x+40,y:centerY,id:1}]);
  await touch('touchStart',[{x:box.x+40,y:centerY,id:1},{x:box.x+90,y:centerY,id:2}]);
  await touch('touchMove',[{x:box.x-15,y:centerY,id:1},{x:box.x+90,y:centerY,id:2}]);
  await touch('touchEnd',[]);
  await page.getByRole('button',{name:'Find functions'}).click();
  await page.getByRole('button',{name:'Simple',exact:true}).click();
  await expect(formula).toContainText('x');
  await touch('touchStart',[{x:box.x+25,y:centerY-40,id:3}]);
  for(let i=1;i<=36;i++){
    const u=-1+2*i/36;
    await touch('touchMove',[{x:box.x+25+(box.width-50)*i/36,y:centerY-40+80*(1-u*u),id:3}]);
  }
  await touch('touchEnd',[]);
  await expect.poll(async()=>{
    const plain=await page.locator('[data-plain]').textContent();
    const disabled=await page.getByRole('button',{name:'Copy LaTeX'}).isDisabled();
    return !disabled&&plain&&plain!==before?plain:'waiting';
  }).not.toBe('waiting');
  expect(errors).toEqual([]);
});
