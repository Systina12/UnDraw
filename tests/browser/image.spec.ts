import {test,expect} from '@playwright/test';

test('uploads a graph, selects a detected edge, then fits only after the button is pressed',async({page})=>{
  await page.goto('/');
  const png=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=220;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,320,220);
    ctx.strokeStyle='#141414';ctx.lineWidth=4;ctx.beginPath();
    for(let x=20;x<=300;x++){
      const y=110+32*Math.sin(x/35);
      if(x===20)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.stroke();return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Upload image').setInputFiles({name:'graph.png',mimeType:'image/png',
    buffer:Buffer.from(png,'base64')});
  await expect(page.locator('[data-image-status]')).toContainText('edges detected');
  await expect(page.locator('[data-image-status]')).toContainText('320 × 220 px');
  const plane=page.locator('canvas[aria-label="Coordinate plane"]');
  const bounds=await plane.boundingBox();expect(bounds).not.toBeNull();
  const scale=Math.min(bounds!.width/(320*1.16),bounds!.height/(220*1.16));
  const x=bounds!.x+bounds!.width/2;
  const y=bounds!.y+(bounds!.height-220*scale)/2+(110+32*Math.sin(160/35))*scale;
  await page.mouse.click(x,y);
  await expect(page.getByTestId('formula')).toContainText('1 stroke ready');
  await page.getByRole('button',{name:'Find functions'}).click();
  await expect(page.getByTestId('formula')).toContainText('Stroke 1');
  await page.getByRole('button',{name:'Remove image'}).click();
  await expect(page.getByTestId('formula')).toContainText('Stroke 1');
  await page.getByRole('button',{name:/Clear/}).click();
  await expect(page.getByTestId('formula')).toContainText('Draw one or more strokes');
});
