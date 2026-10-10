export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

export function mean(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function standardDeviation(values: readonly number[]) {
  const average = mean(values);
  return values.length ? Math.sqrt(mean(values.map((value) => (value - average) ** 2))) : 0;
}

export function simpleMovingAverage(values: readonly number[], period: number) {
  const output: Array<number | null> = values.map(() => null);
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) output[index] = sum / period;
  }
  return output;
}

export function exponentialMovingAverage(values: readonly number[], period: number) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) output.push(values[index] * alpha + output[index - 1] * (1 - alpha));
  return output;
}

export function rollingExtrema(values: readonly number[], period: number, mode: "min" | "max") {
  return values.map<number | null>((_, index) => index < period - 1 ? null : Math[mode](...values.slice(index - period + 1, index + 1)));
}

export function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-clamp(value, -35, 35)));
}

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
