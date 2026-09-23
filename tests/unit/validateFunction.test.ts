import { describe, expect, it } from 'vitest';
import { classifyStroke } from '../../src/core/validateFunction';
import { sanitizeStroke } from '../../src/core/preprocess';

describe('stroke classification', () => {
  it('keeps an ordinary function in its drawing order', () => {
    const p = Array.from({ length: 160 }, (_, i) => ({ x: -2 + i / 40, y: Math.sin(-2 + i / 40), t: i }));
    expect(classifyStroke(p)).toBe('function');
    expect(sanitizeStroke(p).at(-1)).toEqual(p.at(-1));
  });

  it('recognizes a closed circle and a vertical line as parametric', () => {
    const circle = Array.from({ length: 180 }, (_, i) => ({
      x: Math.cos(2 * Math.PI * i / 179), y: Math.sin(2 * Math.PI * i / 179), t: i,
    }));
    expect(classifyStroke(circle)).toBe('parametric');
    expect(classifyStroke(Array.from({ length: 80 }, (_, i) => ({ x: 1, y: i / 20, t: i })))).toBe('parametric');
  });

  it('recognizes a separated retraced path but tolerates small x jitter', () => {
    const up = Array.from({ length: 100 }, (_, i) => ({ x: i / 99, y: i / 99, t: i }));
    const back = Array.from({ length: 100 }, (_, i) => ({ x: 1 - i / 99, y: 2 - i / 99, t: 100 + i }));
    expect(classifyStroke([...up, ...back])).toBe('parametric');
    const jittered = up.map((p, i) => ({ ...p, x: p.x + .002 * Math.sin(7 * i) }));
    expect(classifyStroke(jittered)).toBe('function');
  });

  it('drops non-finite and consecutive duplicate points without sorting', () => {
    const p = sanitizeStroke([
      { x: 2, y: 1, t: 0 }, { x: 2, y: 1, t: 1 }, { x: Number.NaN, y: 0, t: 2 },
      { x: 0, y: 2, t: 3 }, { x: 1, y: 3, t: 4 },
    ]);
    expect(p.map(v => v.x)).toEqual([2, 0, 1]);
  });
});
