// ── Cost Gate Middleware ──
// Pre-flight cost check before every AI request.
// Enforces budget limits and suggests cheaper alternatives.
// Ported from nclamvn/openclawvn bom-optimizer/middleware/cost-gate.ts

import { BudgetManager, type BudgetAlert } from './budget-manager';
import { estimateCost, estimateTokens, getBestModelForBudget, getModelPricing, type ModelPricing } from './model-pricing';

// ── Types ──

export interface CostGateRequest {
  modelId: string;
  inputText: string;
  expectedOutputTokens?: number;   // Estimate or use default
  isVietnamese?: boolean;
  taskType?: string;               // 'chat' | 'code' | 'summary' | 'analysis'
  bypassBudget?: boolean;          // Force allow (for admin)
}

export interface CostGateResult {
  allowed: boolean;
  estimatedCostUSD: number;
  estimatedCostVND: number;
  originalModelId: string;
  recommendedModelId: string;      // May differ if original too expensive
  inputTokens: number;
  outputTokens: number;
  alert: BudgetAlert | null;
  reason?: string;
  savings?: {
    originalCostUSD: number;
    recommendedCostUSD: number;
    savedUSD: number;
    savedPercent: number;
  };
}

// ── Default output assumptions ──
const DEFAULT_OUTPUT_TOKENS: Record<string, number> = {
  chat: 500,
  code: 1200,
  summary: 800,
  analysis: 1500,
};

// ── Service ──

export class CostGateService {
  private budgetManager: BudgetManager;
  private autoDowngrade: boolean;    // Auto-switch to cheaper model
  private maxCostPerRequest: number; // USD

  constructor(
    budgetManager: BudgetManager,
    options?: {
      autoDowngrade?: boolean;
      maxCostPerRequest?: number;
    },
  ) {
    this.budgetManager = budgetManager;
    this.autoDowngrade = options?.autoDowngrade ?? true;
    this.maxCostPerRequest = options?.maxCostPerRequest ?? 0.10; // $0.10 default max
  }

  // ── Pre-flight check ──

  evaluate(request: CostGateRequest): CostGateResult {
    const isVi = request.isVietnamese ?? true;
    const inputTokens = estimateTokens(request.inputText, isVi);
    const outputTokens = request.expectedOutputTokens ?? DEFAULT_OUTPUT_TOKENS[request.taskType || 'chat'] ?? 500;

    // Calculate cost for requested model
    const { costUSD, costVND, model } = estimateCost(request.modelId, inputTokens, outputTokens);

    // Try to find a cheaper alternative
    let recommendedModelId = request.modelId;
    let savings: CostGateResult['savings'] = undefined;

    if (this.autoDowngrade && costUSD > this.maxCostPerRequest) {
      const cheaper = getBestModelForBudget(this.maxCostPerRequest * 1000 / outputTokens);
      if (cheaper && cheaper.modelId !== request.modelId) {
        const cheaperCost = estimateCost(cheaper.modelId, inputTokens, outputTokens);
        recommendedModelId = cheaper.modelId;
        savings = {
          originalCostUSD: costUSD,
          recommendedCostUSD: cheaperCost.costUSD,
          savedUSD: costUSD - cheaperCost.costUSD,
          savedPercent: Math.round(((costUSD - cheaperCost.costUSD) / costUSD) * 100),
        };
      }
    }

    // Check budget
    if (request.bypassBudget) {
      return {
        allowed: true,
        estimatedCostUSD: costUSD,
        estimatedCostVND: costVND,
        originalModelId: request.modelId,
        recommendedModelId,
        inputTokens,
        outputTokens,
        alert: null,
        savings,
      };
    }

    const budgetCheck = this.budgetManager.canMakeRequest(costUSD);
    if (!budgetCheck.allowed) {
      // Try with recommended (cheaper) model
      if (recommendedModelId !== request.modelId) {
        const cheaperCost = estimateCost(recommendedModelId, inputTokens, outputTokens);
        const cheaperCheck = this.budgetManager.canMakeRequest(cheaperCost.costUSD);
        if (cheaperCheck.allowed) {
          return {
            allowed: true,
            estimatedCostUSD: cheaperCost.costUSD,
            estimatedCostVND: cheaperCost.costVND,
            originalModelId: request.modelId,
            recommendedModelId,
            inputTokens,
            outputTokens,
            alert: null,
            reason: `Đã chuyển sang ${recommendedModelId} để phù hợp ngân sách.`,
            savings,
          };
        }
      }

      return {
        allowed: false,
        estimatedCostUSD: costUSD,
        estimatedCostVND: costVND,
        originalModelId: request.modelId,
        recommendedModelId,
        inputTokens,
        outputTokens,
        alert: null,
        reason: budgetCheck.reason,
        savings,
      };
    }

    return {
      allowed: true,
      estimatedCostUSD: costUSD,
      estimatedCostVND: costVND,
      originalModelId: request.modelId,
      recommendedModelId,
      inputTokens,
      outputTokens,
      alert: null,
      savings,
    };
  }

  // ── Record after completion ──

  recordCompletion(
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    costUSD: number,
    taskType?: string,
  ): BudgetAlert | null {
    return this.budgetManager.recordUsage({
      modelId,
      inputTokens,
      outputTokens,
      costUSD,
      taskType,
    });
  }

  // ── Configuration ──

  setAutoDowngrade(enabled: boolean): void {
    this.autoDowngrade = enabled;
  }

  setMaxCostPerRequest(usd: number): void {
    this.maxCostPerRequest = usd;
  }

  getConfig(): { autoDowngrade: boolean; maxCostPerRequest: number } {
    return {
      autoDowngrade: this.autoDowngrade,
      maxCostPerRequest: this.maxCostPerRequest,
    };
  }
}
