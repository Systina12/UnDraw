import { householderQr } from './qr';

export interface LeastSquaresResult { coefficients: Float64Array; rank: number; residualNorm: number }

/** Row-major A. Column scaling keeps rank decisions independent of units. */
export function leastSquares(a: Float64Array, rows: number, cols: number, b: Float64Array, weights?: Float64Array): LeastSquaresResult {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows < cols ||
      a.length !== rows * cols || b.length !== rows || weights && weights.length !== rows) throw new RangeError('Invalid least-squares shape');
  const matrix = new Float64Array(a.length);
  const rhs = new Float64Array(rows);
  const columnScales = new Float64Array(cols);
  for (let i = 0; i < rows; i++) {
    const weight = weights?.[i] ?? 1;
    if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(b[i])) throw new RangeError('Invalid weight or observation');
    const scale = Math.sqrt(weight);
    rhs[i] = b[i] * scale;
    for (let j = 0; j < cols; j++) {
      if (!Number.isFinite(a[i * cols + j])) throw new RangeError('Non-finite matrix');
      matrix[i * cols + j] = a[i * cols + j] * scale;
      columnScales[j] = Math.hypot(columnScales[j], matrix[i * cols + j]);
    }
  }
  for (let j = 0; j < cols; j++) if (columnScales[j] !== 0) {
    for (let i = 0; i < rows; i++) matrix[i * cols + j] /= columnScales[j];
  }
  householderQr(matrix, rows, cols, rhs);
  const tolerance = Number.EPSILON * 16 * Math.max(rows, cols) * Math.max(1, ...Array.from({length: cols}, (_, j) => Math.abs(matrix[j * cols + j])));
  const scaled = new Float64Array(cols);
  let rank = 0;
  for (let j = cols - 1; j >= 0; j--) {
    const pivot = matrix[j * cols + j];
    if (Math.abs(pivot) <= tolerance || columnScales[j] === 0) continue;
    rank++;
    let value = rhs[j];
    for (let k = j + 1; k < cols; k++) value -= matrix[j * cols + k] * scaled[k];
    scaled[j] = value / pivot;
  }
  const coefficients = Float64Array.from(scaled, (v, j) => columnScales[j] ? v / columnScales[j] : 0);
  let error = 0;
  for (let i = 0; i < rows; i++) {
    let prediction = 0;
    for (let j = 0; j < cols; j++) prediction += a[i * cols + j] * coefficients[j];
    error = Math.hypot(error, Math.sqrt(weights?.[i] ?? 1) * (prediction - b[i]));
  }
  return { coefficients, rank, residualNorm: error };
}
