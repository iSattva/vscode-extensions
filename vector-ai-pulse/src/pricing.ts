export interface ModelRate {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface UsageTokens {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
}

// Per-million-token USD. Starting point for the shipped config; users
// override via vector.aiPulse.pricing (exact model id, or a prefix ending
// in "*"). Review against current published rates before v1.0 release (Q5).
export const DEFAULT_PRICING: Record<string, ModelRate> = {
  "claude-opus-*": { input: 15, output: 75 },
  "claude-sonnet-*": { input: 3, output: 15 },
  "claude-haiku-*": { input: 0.8, output: 4 },
};

const FALLBACK_RATE: ModelRate = { input: 3, output: 15 };

function resolveRate(modelId: string, pricing: Record<string, ModelRate>): ModelRate {
  if (pricing[modelId]) return pricing[modelId];
  let best: ModelRate | undefined;
  let bestLen = -1;
  for (const [key, rate] of Object.entries(pricing)) {
    if (!key.endsWith("*")) continue;
    const prefix = key.slice(0, -1);
    if (modelId.startsWith(prefix) && prefix.length > bestLen) {
      best = rate;
      bestLen = prefix.length;
    }
  }
  return best ?? FALLBACK_RATE;
}

// cache-read defaults to ~10% of input rate, cache-write (cache creation)
// to ~125% of input, matching Anthropic's short-lived cache multipliers,
// unless the user's config specifies its own rates for that model.
export function getModelPricing(modelId: string, userPricing: Record<string, ModelRate> | undefined): Required<ModelRate> {
  const merged = { ...DEFAULT_PRICING, ...(userPricing ?? {}) };
  const rate = resolveRate(modelId, merged);
  return {
    input: rate.input,
    output: rate.output,
    cacheRead: rate.cacheRead ?? rate.input * 0.1,
    cacheWrite: rate.cacheWrite ?? rate.input * 1.25,
  };
}

export function computeCost(usage: UsageTokens, modelId: string, userPricing: Record<string, ModelRate> | undefined): number {
  const rate = getModelPricing(modelId, userPricing);
  const perToken = (tokens: number, rateUsdPerMillion: number) => (tokens / 1_000_000) * rateUsdPerMillion;
  const cost =
    perToken(usage.inputTokens, rate.input) +
    perToken(usage.outputTokens, rate.output) +
    perToken(usage.cacheReadTokens, rate.cacheRead) +
    perToken(usage.cacheCreateTokens, rate.cacheWrite);
  return Number.isFinite(cost) ? cost : 0;
}
