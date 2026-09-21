import { dot, norm } from "./vector";

export type Matrix = number[][];

export function transpose(matrix: Matrix): Matrix {
  if (matrix.length === 0) return [];
  const columns = matrix[0]?.length ?? 0;
  return Array.from({ length: columns }, (_, column) => matrix.map((row) => row[column] ?? 0));
}

export function matrixMultiply(left: Matrix, right: Matrix): Matrix {
  const rightT = transpose(right);
  return left.map((row) => rightT.map((column) => dot(row, column)));
}

function weightedRows(matrix: Matrix, values: readonly number[], weights?: readonly number[]): { a: Matrix; b: number[] } {
  const a: Matrix = [];
  const b: number[] = [];
  for (let row = 0; row < matrix.length; row += 1) {
    const weight = Math.sqrt(Math.max(0, weights?.[row] ?? 1));
    a.push((matrix[row] ?? []).map((value) => value * weight));
    b.push((values[row] ?? 0) * weight);
  }
  return { a, b };
}

export function leastSquares(matrix: Matrix, values: readonly number[], weights?: readonly number[]): number[] {
  const { a, b } = weightedRows(matrix, values, weights);
  const rows = a.length;
  const columns = a[0]?.length ?? 0;
  if (columns === 0) return [];

  const q: Matrix = Array.from({ length: columns }, () => Array<number>(rows).fill(0));
  const r: Matrix = Array.from({ length: columns }, () => Array<number>(columns).fill(0));
  const eps = 1e-12;

  for (let column = 0; column < columns; column += 1) {
    let vector = a.map((row) => row[column] ?? 0);
    for (let previous = 0; previous < column; previous += 1) {
      const qPrevious = q[previous] ?? [];
      const projection = dot(vector, qPrevious);
      if (r[previous]) r[previous]![column] = projection;
      vector = vector.map((value, index) => value - projection * (qPrevious[index] ?? 0));
    }
    for (let previous = 0; previous < column; previous += 1) {
      const qPrevious = q[previous] ?? [];
      const correction = dot(vector, qPrevious);
      if (r[previous]) r[previous]![column] = (r[previous]![column] ?? 0) + correction;
      vector = vector.map((value, index) => value - correction * (qPrevious[index] ?? 0));
    }
    const length = norm(vector);
    if (r[column]) r[column]![column] = length;
    q[column] = length > eps ? vector.map((value) => value / length) : Array<number>(rows).fill(0);
  }

  const qtB = q.map((column) => dot(column, b));
  const solution = Array<number>(columns).fill(0);
  for (let row = columns - 1; row >= 0; row -= 1) {
    const diagonal = r[row]?.[row] ?? 0;
    const tail = solution.slice(row + 1).reduce((total, value, offset) => total + (r[row]?.[row + 1 + offset] ?? 0) * value, 0);
    solution[row] = Math.abs(diagonal) > eps ? ((qtB[row] ?? 0) - tail) / diagonal : 0;
  }
  return solution;
}

export function solveLinear(matrix: Matrix, values: readonly number[]): number[] {
  const n = matrix.length;
  const augmented = matrix.map((row, index) => [...row, values[index] ?? 0]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row]?.[column] ?? 0) > Math.abs(augmented[pivot]?.[column] ?? 0)) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot] ?? [], augmented[column] ?? []];
    const divisor = augmented[column]?.[column] ?? 0;
    if (Math.abs(divisor) < 1e-12) continue;
    for (let row = column + 1; row < n; row += 1) {
      const factor = (augmented[row]?.[column] ?? 0) / divisor;
      for (let value = column; value <= n; value += 1) {
        if (augmented[row]) augmented[row]![value] = (augmented[row]![value] ?? 0) - factor * (augmented[column]?.[value] ?? 0);
      }
    }
  }
  const result = Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    const divisor = augmented[row]?.[row] ?? 0;
    const tail = result.slice(row + 1).reduce((total, value, offset) => total + (augmented[row]?.[row + 1 + offset] ?? 0) * value, 0);
    result[row] = Math.abs(divisor) > 1e-12 ? ((augmented[row]?.[n] ?? 0) - tail) / divisor : 0;
  }
  return result;
}

export function residuals(matrix: Matrix, solution: readonly number[], values: readonly number[]): number[] {
  return matrix.map((row, index) => dot(row, solution) - (values[index] ?? 0));
}
