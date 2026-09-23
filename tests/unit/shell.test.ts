import { describe, expect, it } from 'vitest';
import { createAppShell } from '../../src/ui/app';

describe('app shell', () => {
  it('shows a drawable coordinate plane and its instruction', () => {
    const root = document.createElement('div');
    createAppShell(root);
    expect(root.querySelector('canvas[aria-label="Coordinate plane"]')).not.toBeNull();
    expect(root.textContent).toContain('Draw one or more strokes');
  });
});
