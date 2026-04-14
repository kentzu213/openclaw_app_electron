// ── Model Pricing Data ──
// Ported from nclamvn/openclawvn bom-optimizer/cost/pricing.ts
// All prices in USD per 1K tokens (as of 2026-04)

export interface ModelPricing {
  modelId: string;
  name: string;
  provider: string;
  inputPer1K: number;   // USD per 1K input tokens
  outputPer1K: number;  // USD per 1K output tokens
  contextWindow: number;
  tier: 'free' | 'budget' | 'standard' | 'premium' | 'ultra';
  speedMs: number;      // Average response time in ms (rough estimate)
}

// ── Pricing Table ──

export const MODEL_PRICING: ModelPricing[] = [
  // ── Free Tier ──
  { modelId: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', inputPer1K: 0, outputPer1K: 0, contextWindow: 1000000, tier: 'free', speedMs: 600 },
  { modelId: 'gemma4:e2b', name: 'Gemma 4 (2B)', provider: 'ollama', inputPer1K: 0, outputPer1K: 0, contextWindow: 128000, tier: 'free', speedMs: 400 },
  { modelId: 'qwen3.5', name: 'Qwen 3.5', provider: 'ollama', inputPer1K: 0, outputPer1K: 0, contextWindow: 128000, tier: 'free', speedMs: 450 },

  // ── Budget Tier ──
  { modelId: 'claude-4-haiku', name: 'Claude 4 Haiku', provider: 'anthropic', inputPer1K: 0.0008, outputPer1K: 0.004, contextWindow: 200000, tier: 'budget', speedMs: 800 },
  { modelId: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'openai', inputPer1K: 0.0004, outputPer1K: 0.0016, contextWindow: 1000000, tier: 'budget', speedMs: 700 },
  { modelId: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', inputPer1K: 0.00125, outputPer1K: 0.005, contextWindow: 1000000, tier: 'budget', speedMs: 1200 },
  { modelId: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek', inputPer1K: 0.00027, outputPer1K: 0.0011, contextWindow: 128000, tier: 'budget', speedMs: 1000 },

  // ── Standard Tier ──
  { modelId: 'claude-4-sonnet', name: 'Claude 4 Sonnet', provider: 'anthropic', inputPer1K: 0.003, outputPer1K: 0.015, contextWindow: 200000, tier: 'standard', speedMs: 1500 },
  { modelId: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai', inputPer1K: 0.003, outputPer1K: 0.012, contextWindow: 200000, tier: 'standard', speedMs: 1200 },
  { modelId: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai', inputPer1K: 0.005, outputPer1K: 0.02, contextWindow: 200000, tier: 'standard', speedMs: 1400 },

  // ── Premium Tier ──
  { modelId: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', inputPer1K: 0.015, outputPer1K: 0.075, contextWindow: 200000, tier: 'premium', speedMs: 3000 },
  { modelId: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'openai', inputPer1K: 0.015, outputPer1K: 0.06, contextWindow: 200000, tier: 'premium', speedMs: 2500 },

  // ── Ultra Tier ──
  { modelId: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', provider: 'openai', inputPer1K: 0.04, outputPer1K: 0.12, contextWindow: 200000, tier: 'ultra', speedMs: 4000 },
  { modelId: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'deepseek', inputPer1K: 0.0055, outputPer1K: 0.022, contextWindow: 128000, tier: 'ultra', speedMs: 3500 },

  // ── Izzi Smart Router ──
  { modelId: 'izzi/auto', name: 'Izzi Smart Router', provider: 'izzi', inputPer1K: 0.002, outputPer1K: 0.008, contextWindow: 200000, tier: 'standard', speedMs: 1000 },
];

// ── Lookup Helpers ──

const pricingMap = new Map<string, ModelPricing>();
for (const m of MODEL_PRICING) {
  pricingMap.set(m.modelId, m);
}

export function getModelPricing(modelId: string): ModelPricing | undefined {
  return pricingMap.get(modelId);
}

export function getModelsByTier(tier: ModelPricing['tier']): ModelPricing[] {
  return MODEL_PRICING.filter(m => m.tier === tier);
}

export function getCheapestModel(): ModelPricing {
  return MODEL_PRICING.reduce((best, m) =>
    (m.outputPer1K < best.outputPer1K) ? m : best
  );
}

export function getBestModelForBudget(maxCostPer1K: number): ModelPricing | undefined {
  const candidates = MODEL_PRICING
    .filter(m => m.outputPer1K <= maxCostPer1K)
    .sort((a, b) => b.outputPer1K - a.outputPer1K); // Best quality within budget
  return candidates[0];
}

// ── Token Estimation ──

/**
 * Rough estimate: 1 token ≈ 4 characters for English, ≈ 2 characters for Vietnamese.
 */
export function estimateTokens(text: string, isVietnamese = true): number {
  const charPerToken = isVietnamese ? 2 : 4;
  return Math.ceil(text.length / charPerToken);
}

/**
 * Estimate cost in USD for a given request.
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): { costUSD: number; costVND: number; model: ModelPricing | undefined } {
  const model = getModelPricing(modelId);
  if (!model) return { costUSD: 0, costVND: 0, model: undefined };

  const inputCost = (inputTokens / 1000) * model.inputPer1K;
  const outputCost = (outputTokens / 1000) * model.outputPer1K;
  const costUSD = inputCost + outputCost;
  const costVND = costUSD * 25500; // Approximate USD/VND rate

  return { costUSD, costVND, model };
}

// ── Tier Descriptions (for UI) ──

export const TIER_INFO: Record<ModelPricing['tier'], { label: string; labelVi: string; color: string; description: string }> = {
  free: { label: 'Free', labelVi: 'Miễn phí', color: '#4ade80', description: 'No cost — local or free-tier models' },
  budget: { label: 'Budget', labelVi: 'Tiết kiệm', color: '#60a5fa', description: 'Low cost — great for daily use' },
  standard: { label: 'Standard', labelVi: 'Tiêu chuẩn', color: '#f59e0b', description: 'Balanced cost and quality' },
  premium: { label: 'Premium', labelVi: 'Cao cấp', color: '#f97316', description: 'High quality — for complex tasks' },
  ultra: { label: 'Ultra', labelVi: 'Siêu cấp', color: '#ef4444', description: 'Maximum capability — highest cost' },
};
