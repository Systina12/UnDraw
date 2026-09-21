export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

export function quantile(values: readonly number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const p = Math.min(1, Math.max(0, probability));
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const left = sorted[lower] ?? 0;
  const right = sorted[upper] ?? left;
  return left + (right - left) * (position - lower);
}

export function mad(values: readonly number[]): number {
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

export function dot(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  let result = 0;
  for (let index = 0; index < length; index += 1) {
    result += (a[index] ?? 0) * (b[index] ?? 0);
  }
  return result;
}

export function norm(values: readonly number[]): number {
  return Math.sqrt(dot(values, values));
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
