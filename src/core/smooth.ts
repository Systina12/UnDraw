import { median } from '../math/statistics';

function solveSmall(a: number[][], b: number[]): number[] {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) return [b[0] / Math.max(1, a[0][0])];
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    const lead = a[col][col];
    for (let k = col; k < n; k++) a[col][k] /= lead;
    b[col] /= lead;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let k = col; k < n; k++) a[row][k] -= factor * a[col][k];
      b[row] -= factor * b[col];
    }
  }
  return b;
}

export function smoothSeries(y: Float64Array): Float64Array {
  if (y.length < 2) return y.slice();
  const filtered = Float64Array.from(y, (_, i) => {
    const values: number[] = [];
    for (let j = Math.max(0, i - 2); j <= Math.min(y.length - 1, i + 2); j++) values.push(y[j]);
    return median(values);
  });
  const output = new Float64Array(y.length);
  const degree = Math.min(3, y.length - 1);
  for (let i = 0; i < y.length; i++) {
    const start = Math.max(0, i - 5);
    const end = Math.min(y.length - 1, i + 5);
    const a = Array.from({ length: degree + 1 }, () => Array(degree + 1).fill(0));
    const b = Array(degree + 1).fill(0);
    for (let j = start; j <= end; j++) {
      const offset = (j - i) / 5;
      for (let row = 0; row <= degree; row++) {
        b[row] += offset ** row * filtered[j];
        for (let col = 0; col <= degree; col++) a[row][col] += offset ** (row + col);
      }
    }
    output[i] = solveSmall(a, b)[0];
  }
  return output;
}
