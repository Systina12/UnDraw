export function percentile(values: readonly number[], p: number): number {
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('Quantile must be between zero and one');
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!ordered.length) throw new RangeError('Distribution must contain a finite number');
  const index = (ordered.length - 1) * p;
  const low = Math.floor(index);
  const fraction = index - low;
  return ordered[low] + fraction * (ordered[Math.min(low + 1, ordered.length - 1)] - ordered[low]);
}

export function median(values: readonly number[]): number { return percentile(values, .5); }

export function mad(values: readonly number[]): number {
  const center = median(values);
  return median(values.map(value => Math.abs(value - center)));
}
