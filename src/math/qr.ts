/** In-place Householder QR; the transformed right-hand side contains Q^T b. */
export function householderQr(matrix: Float64Array, rows: number, cols: number, rhs: Float64Array): void {
  for (let k = 0; k < Math.min(rows, cols); k++) {
    let length = 0;
    for (let i = k; i < rows; i++) length = Math.hypot(length, matrix[i * cols + k]);
    if (length === 0) continue;
    const sign = matrix[k * cols + k] >= 0 ? 1 : -1;
    const vector = new Float64Array(rows - k);
    vector[0] = matrix[k * cols + k] + sign * length;
    for (let i = k + 1; i < rows; i++) vector[i - k] = matrix[i * cols + k];
    let vnorm2 = 0;
    for (const v of vector) vnorm2 += v * v;
    if (vnorm2 === 0) continue;
    const scale = 2 / vnorm2;
    for (let j = k; j < cols; j++) {
      let projection = 0;
      for (let i = k; i < rows; i++) projection += vector[i - k] * matrix[i * cols + j];
      projection *= scale;
      for (let i = k; i < rows; i++) matrix[i * cols + j] -= projection * vector[i - k];
    }
    let projection = 0;
    for (let i = k; i < rows; i++) projection += vector[i - k] * rhs[i];
    projection *= scale;
    for (let i = k; i < rows; i++) rhs[i] -= projection * vector[i - k];
  }
}
