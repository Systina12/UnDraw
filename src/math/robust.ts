export function huberWeight(residual: number, delta: number): number {
  const magnitude = Math.abs(residual);
  return magnitude <= delta || magnitude === 0 ? 1 : delta / magnitude;
}

export function huberLoss(residual: number, delta: number): number {
  const magnitude = Math.abs(residual);
  return magnitude <= delta ? 0.5 * magnitude * magnitude : delta * (magnitude - 0.5 * delta);
}

export function huberError(residuals: readonly number[], delta: number): number {
  if (residuals.length === 0) return 0;
  return residuals.reduce((total, residual) => total + huberLoss(residual, delta), 0) / residuals.length;
}
