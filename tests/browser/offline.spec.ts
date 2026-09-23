import {test,expect} from '@playwright/test';
import {drawWorldCurve} from './helpers';

test('after the first online visit, an offline reload still solves in the Worker',async ({page,context})=>{
  await page.goto('/');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await drawWorldCurve(page,x=>2*Math.sin(Math.PI*x));
  await expect(page.getByRole('button',{name:'Balanced',exact:true})).toBeVisible();
  await expect(page.getByTestId('formula')).toContainText('sin');
  await expect(page.locator('[data-plain]')).not.toBeEmpty();
});
