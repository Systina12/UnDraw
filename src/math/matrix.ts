export function multiplyMatrix(a: Float64Array, rows: number, inner: number, b: Float64Array, cols: number): Float64Array {
  if (a.length !== rows * inner || b.length !== inner * cols) throw new RangeError('Matrix dimensions differ');
  const result = new Float64Array(rows * cols);
  for (let i = 0; i < rows; i++) for (let k = 0; k < inner; k++) {
    for (let j = 0; j < cols; j++) result[i * cols + j] += a[i * inner + k] * b[k * cols + j];
  }
  return result;
}
