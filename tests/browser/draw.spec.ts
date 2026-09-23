import {test,expect} from '@playwright/test';
import {drawWorldCurve,drawWorldPath} from './helpers';

test('draws, switches Pareto choices, copies LaTeX, undoes and clears',async ({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('/');
  await drawWorldCurve(page,x=>2*Math.sin(Math.PI*x));
  const formula=page.getByTestId('formula');
  await expect(formula).toContainText('sin');
  await expect(page.locator('[data-quality]')).toContainText(/match|Approximation|confidence/);
  for(const choice of ['Simple','Accurate','Balanced']){
    await page.getByRole('button',{name:choice,exact:true}).click();
    await expect(page.getByRole('button',{name:choice,exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(formula).not.toContainText('Draw a curve');
  }
  await page.getByRole('button',{name:'Copy LaTeX'}).click();
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toContain('sin');
  await page.getByRole('button',{name:/Undo/}).click();
  await expect(formula).toContainText('Draw a curve');
  await drawWorldCurve(page,x=>x*x,-2,2);
  await expect(formula).not.toContainText('Draw a curve');
  await page.getByRole('button',{name:/Clear/}).click();
  await expect(formula).toContainText('Draw a curve');
});

test('a circle receives two parametric expressions',async ({page})=>{
  await page.goto('/');
  await drawWorldPath(page,Array.from({length:144},(_,i)=>{
    const angle=2*Math.PI*i/143;
    return {x:1.5*Math.cos(angle),y:1.5*Math.sin(angle)};
  }));
  await expect(page.getByTestId('formula')).toContainText('x(t)');
  await expect(page.getByTestId('formula')).toContainText('y(t)');
});

test('a new stroke cancels an older solve and keeps the latest result',async ({page})=>{
  await page.goto('/');
  await drawWorldCurve(page,x=>2*Math.sin(Math.PI*x));
  await drawWorldCurve(page,x=>x*x+1);
  const plain=page.locator('[data-plain]');
  await expect(plain).toContainText('x');
  await expect(plain).not.toContainText('sin');
  await expect(page.getByRole('button',{name:'Balanced',exact:true})).toHaveAttribute('aria-pressed','true');
});
