import {test,expect} from '@playwright/test';
import {drawWorldCurve,drawWorldPath} from './helpers';

test('draws, switches Pareto choices, copies LaTeX, undoes and clears',async ({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('/');
  await drawWorldCurve(page,x=>2*Math.sin(Math.PI*x));
  const formula=page.getByTestId('formula');
  await expect(formula).toContainText('1 stroke ready');
  await page.getByRole('button',{name:'Find functions'}).click();
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
  await expect(formula).toContainText('Draw one or more strokes');
  await drawWorldCurve(page,x=>x*x,-2,2);
  await page.getByRole('button',{name:'Find functions'}).click();
  await expect(formula).not.toContainText('Draw one or more strokes');
  await page.getByRole('button',{name:/Clear/}).click();
  await expect(formula).toContainText('Draw one or more strokes');
});

test('a circle receives two parametric expressions',async ({page})=>{
  await page.goto('/');
  await drawWorldPath(page,Array.from({length:144},(_,i)=>{
    const angle=2*Math.PI*i/143;
    return {x:1.5*Math.cos(angle),y:1.5*Math.sin(angle)};
  }));
  await page.getByRole('button',{name:'Find functions'}).click();
  await expect(page.getByTestId('formula')).toContainText('x(t)');
  await expect(page.getByTestId('formula')).toContainText('y(t)');
});

test('multiple strokes wait for the button and show each expression',async ({page})=>{
  await page.goto('/');
  await drawWorldCurve(page,x=>2*Math.sin(Math.PI*x));
  await drawWorldCurve(page,x=>x*x+1);
  await expect(page.getByTestId('formula')).toContainText('2 strokes ready');
  await page.getByRole('button',{name:'Find functions'}).click();
  await expect(page.locator('.formula-row')).toHaveCount(2);
  await expect(page.getByTestId('formula')).toContainText('Stroke 1');
  await expect(page.getByTestId('formula')).toContainText('Stroke 2');
  await expect(page.getByRole('button',{name:'Balanced',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('automatic mode can merge two collinear strokes into one formula',async({page})=>{
  await page.goto('/');
  await drawWorldCurve(page,x=>x,-2,-.3);
  await drawWorldCurve(page,x=>x,.3,2);
  await page.getByRole('radio',{name:/Best fit/}).check();
  await page.getByRole('button',{name:'Find functions'}).click();
  await expect(page.locator('.formula-row')).toHaveCount(1);
  await expect(page.getByTestId('formula')).toContainText('Function 1');
});
