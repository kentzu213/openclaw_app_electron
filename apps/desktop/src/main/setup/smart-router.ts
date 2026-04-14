// ── Smart Router ──
// Picks the optimal model based on task type, budget, and quality preferences.
// Ported from nclamvn/openclawvn bom-optimizer/routing/smart-router.ts

import { MODEL_PRICING, getModelPricing, type ModelPricing, estimateTokens, estimateCost } from './model-pricing';
import { BudgetManager } from './budget-manager';

// ── Types ──

export type TaskType = 'chat' | 'code' | 'summary' | 'translation' | 'analysis' | 'creative' | 'quick';

export interface RoutingPreferences {
  prioritize: 'cost' | 'quality' | 'speed' | 'balanced';
  preferredProviders?: string[];       // e.g. ['anthropic', 'openai']
  excludeProviders?: string[];
  maxTier?: ModelPricing['tier'];
  minContextWindow?: number;
  preferLocal?: boolean;              // Prefer Ollama models
}

export interface RouteDecision {
  selectedModel: ModelPricing;
  reason: string;
  reasonVi: string;
  alternatives: ModelPricing[];
  estimatedCostUSD: number;
  score: number;
}

// ── Quality Scores by Task Type (subjective, tunable) ──

const TASK_QUALITY: Record<TaskType, Record<string, number>> = {
  chat: {
    'claude-4-haiku': 8, 'gpt-4.1-mini': 8, 'gemini-2.5-flash': 7,
    'claude-4-sonnet': 9, 'gpt-5.2': 9, 'gpt-5.4': 9,
    'claude-opus-4-6': 10, 'deepseek-chat': 7, 'izzi/auto': 8,
  },
  code: {
    'claude-4-sonnet': 9, 'gpt-5.3-codex': 10, 'gpt-5.1-codex': 10,
    'claude-opus-4-6': 9, 'deepseek-chat': 8, 'gpt-5.2': 8,
    'claude-4-haiku': 6, 'gpt-4.1-mini': 7, 'gemini-2.5-pro': 8,
  },
  summary: {
    'claude-4-haiku': 8, 'gpt-4.1-mini': 8, 'gemini-2.5-flash': 8,
    'claude-4-sonnet': 9, 'gpt-5.2': 9, 'deepseek-chat': 7,
  },
  translation: {
    'gpt-5.2': 9, 'claude-4-sonnet': 9, 'gemini-2.5-pro': 8,
    'claude-4-haiku': 7, 'gpt-4.1-mini': 7, 'deepseek-chat': 6,
  },
  analysis: {
    'claude-opus-4-6': 10, 'gpt-5.4': 9, 'claude-4-sonnet': 9,
    'deepseek-reasoner': 9, 'gpt-5.2': 8, 'gemini-2.5-pro': 8,
  },
  creative: {
    'claude-opus-4-6': 10, 'claude-4-sonnet': 9, 'gpt-5.4': 9,
    'gpt-5.2': 8, 'gemini-2.5-pro': 7,
  },
  quick: {
    'gemini-2.5-flash': 9, 'gpt-4.1-mini': 8, 'claude-4-haiku': 8,
    'gemma4:e2b': 7, 'qwen3.5': 7,
  },
};

// ── Tier ordering ──
const TIER_ORDER: Record<ModelPricing['tier'], number> = {
  free: 0, budget: 1, standard: 2, premium: 3, ultra: 4,
};

// ── Service ──

export class SmartRouter {
  private budgetManager: BudgetManager;
  private preferences: RoutingPreferences;

  constructor(budgetManager: BudgetManager, preferences?: Partial<RoutingPreferences>) {
    this.budgetManager = budgetManager;
    this.preferences = {
      prioritize: 'balanced',
      preferLocal: false,
      ...preferences,
    };
  }

  // ── Route a task ──

  route(taskType: TaskType, inputText: string, isVietnamese = true): RouteDecision {
    const inputTokens = estimateTokens(inputText, isVietnamese);
    const candidates = this.getCandidates(taskType);

    if (candidates.length === 0) {
      // Fallback to any available model
      const fallback = MODEL_PRICING[0];
      return {
        selectedModel: fallback,
        reason: 'No suitable model found, using fallback.',
        reasonVi: 'Không tìm thấy model phù hợp, sử dụng mặc định.',
        alternatives: [],
        estimatedCostUSD: 0,
        score: 0,
      };
    }

    // Score each candidate
    const scored = candidates.map(model => ({
      model,
      score: this.scoreModel(model, taskType, inputTokens),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const selected = scored[0];
    const est = estimateCost(selected.model.modelId, inputTokens, 500);

    return {
      selectedModel: selected.model,
      reason: `Selected ${selected.model.name} (score: ${selected.score.toFixed(1)}) — ${this.preferences.prioritize} priority.`,
      reasonVi: `Đã chọn ${selected.model.name} (điểm: ${selected.score.toFixed(1)}) — ưu tiên ${this.getViPriority()}.`,
      alternatives: scored.slice(1, 4).map(s => s.model),
      estimatedCostUSD: est.costUSD,
      score: selected.score,
    };
  }

  // ── Update preferences ──

  setPreferences(prefs: Partial<RoutingPreferences>): void {
    this.preferences = { ...this.preferences, ...prefs };
  }

  getPreferences(): RoutingPreferences {
    return { ...this.preferences };
  }

  // ── Internal ──

  private getCandidates(taskType: TaskType): ModelPricing[] {
    let models = [...MODEL_PRICING];

    // Filter by excluded providers
    if (this.preferences.excludeProviders?.length) {
      models = models.filter(m => !this.preferences.excludeProviders!.includes(m.provider));
    }

    // Filter by preferred providers (if set, only use these)
    if (this.preferences.preferredProviders?.length) {
      const preferred = models.filter(m => this.preferences.preferredProviders!.includes(m.provider));
      if (preferred.length > 0) models = preferred;
    }

    // Filter by max tier
    if (this.preferences.maxTier) {
      const maxOrder = TIER_ORDER[this.preferences.maxTier];
      models = models.filter(m => TIER_ORDER[m.tier] <= maxOrder);
    }

    // Filter by context window
    if (this.preferences.minContextWindow) {
      models = models.filter(m => m.contextWindow >= this.preferences.minContextWindow!);
    }

    return models;
  }

  private scoreModel(model: ModelPricing, taskType: TaskType, inputTokens: number): number {
    const qualityMap = TASK_QUALITY[taskType] || {};
    const quality = qualityMap[model.modelId] ?? 5; // Default quality 5

    const est = estimateCost(model.modelId, inputTokens, 500);
    const costPenalty = Math.min(est.costUSD * 100, 10); // 0-10 scale

    const speedBonus = Math.max(0, 10 - (model.speedMs / 500)); // Faster = higher

    const localBonus = (this.preferences.preferLocal && model.provider === 'ollama') ? 3 : 0;

    // Budget safety: penalize if it would exceed budget
    const budgetCheck = this.budgetManager.canMakeRequest(est.costUSD);
    const budgetPenalty = budgetCheck.allowed ? 0 : 15;

    switch (this.preferences.prioritize) {
      case 'cost':
        return (quality * 0.3) + ((10 - costPenalty) * 0.5) + (speedBonus * 0.1) + localBonus - budgetPenalty;
      case 'quality':
        return (quality * 0.6) + ((10 - costPenalty) * 0.1) + (speedBonus * 0.2) + localBonus - budgetPenalty;
      case 'speed':
        return (quality * 0.2) + ((10 - costPenalty) * 0.2) + (speedBonus * 0.5) + localBonus - budgetPenalty;
      case 'balanced':
      default:
        return (quality * 0.4) + ((10 - costPenalty) * 0.3) + (speedBonus * 0.2) + localBonus - budgetPenalty;
    }
  }

  private getViPriority(): string {
    switch (this.preferences.prioritize) {
      case 'cost': return 'tiết kiệm';
      case 'quality': return 'chất lượng';
      case 'speed': return 'tốc độ';
      default: return 'cân bằng';
    }
  }
}
