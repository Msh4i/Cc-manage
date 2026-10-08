export const near = (a: number | null | undefined, b: number, eps = 1e-6) => a != null && Math.abs(a - b) < eps
