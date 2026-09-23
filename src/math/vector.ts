export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new RangeError('Vector dimensions differ');
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function norm(a: ArrayLike<number>): number { return Math.hypot(...Array.from(a)); }
