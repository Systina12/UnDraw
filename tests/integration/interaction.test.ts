import {it,expect,vi} from 'vitest';
import {createAppShell} from '../../src/ui/app';
it('exposes canvas, copy buttons, undo, clear and reset view as accessible controls',()=>{
  const root=document.createElement('div');
  root.innerHTML='';
  const canvas=createAppShell(root);
  expect(canvas.getAttribute('aria-label')).toMatch(/coordinate plane/i);
  expect(root.querySelector('[data-action="copy-latex"]')).not.toBeNull();
  expect(root.querySelector('[data-action="copy-plain"]')).not.toBeNull();
  expect(root.querySelector('[data-action="undo"]')).not.toBeNull();
  expect(root.querySelector('[data-action="clear"]')).not.toBeNull();
  expect(root.querySelector('[data-action="reset-view"]')).not.toBeNull();
  expect(root.querySelectorAll('[data-choice]')).toHaveLength(3);
  vi.restoreAllMocks();
});
