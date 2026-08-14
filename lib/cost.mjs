import pricing from './pricing.mjs';

export const PRICING = pricing;
export const PROVIDERS = pricing.providers;

/** Look up per-MTok rates for a model id, falling back to prefix rules. */
export function rateFor(modelId) {
  if (!modelId) return null;
  const exact = pricing.models[modelId];
  if (exact) return exact;
  for (const rule of pricing.fallback.rules) {
    if (modelId.startsWith(rule.prefix)) {
      return { provider: null, label: modelId, input: rule.input, output: rule.output, inferred: true };
    }
  }
  return null;
}

const M = 1_000_000;

/**
 * Cost in USD for one bucket of token counts, priced at published API rates.
 * `tokens` fields are raw counts; missing fields are treated as zero.
 */
export function costOf(modelId, tokens) {
  const r = rateFor(modelId);
  if (!r) return { usd: 0, priced: false };
  const d = pricing.defaults;
  const usd =
    ((tokens.input || 0) * r.input +
      (tokens.output || 0) * r.output +
      (tokens.cacheWrite5m || 0) * r.input * d.cacheWrite5mMultiplier +
      (tokens.cacheWrite1h || 0) * r.input * d.cacheWrite1hMultiplier +
      (tokens.cacheRead || 0) * r.input * d.cacheReadMultiplier) /
    M;
  return { usd, priced: true, inferred: !!r.inferred };
}

/** Sum of every token class — the headline "total tokens" figure. */
export function totalTokens(t) {
  return (
    (t.input || 0) +
    (t.output || 0) +
    (t.cacheWrite5m || 0) +
    (t.cacheWrite1h || 0) +
    (t.cacheRead || 0) +
    (t.reasoning || 0)
  );
}

export function emptyTokens() {
  return { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, reasoning: 0 };
}

export function addTokens(a, b) {
  for (const k of Object.keys(a)) a[k] += b[k] || 0;
  return a;
}
