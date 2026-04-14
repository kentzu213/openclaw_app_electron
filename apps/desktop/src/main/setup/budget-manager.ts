// ── Budget Manager ──
// Ported from nclamvn/openclawvn bom-optimizer/cost/budget-manager.ts
// Tracks spending and enforces daily/weekly/monthly limits.

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ── Types ──

export interface BudgetLimits {
  daily: number;    // USD
  weekly: number;   // USD
  monthly: number;  // USD
}

export interface UsageRecord {
  timestamp: number;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  taskType?: string;
}

export interface BudgetStatus {
  daily: { used: number; limit: number; percent: number; exceeded: boolean };
  weekly: { used: number; limit: number; percent: number; exceeded: boolean };
  monthly: { used: number; limit: number; percent: number; exceeded: boolean };
  totalSpent: number;
  totalRequests: number;
  avgCostPerRequest: number;
  modelBreakdown: Record<string, { count: number; costUSD: number }>;
}

export interface BudgetAlert {
  type: 'warning' | 'exceeded';
  period: 'daily' | 'weekly' | 'monthly';
  percent: number;
  used: number;
  limit: number;
  timestamp: number;
}

// ── Default Budgets ──

const DEFAULT_LIMITS: BudgetLimits = {
  daily: 1.0,    // $1/day
  weekly: 5.0,   // $5/week
  monthly: 15.0, // $15/month
};

const WARNING_THRESHOLD = 80; // Alert at 80% usage

// ── Service ──

export class BudgetManager {
  private dataPath: string;
  private limits: BudgetLimits;
  private records: UsageRecord[] = [];
  private alerts: BudgetAlert[] = [];
  private alertCallback: ((alert: BudgetAlert) => void) | null = null;

  constructor(dataDir?: string) {
    const baseDir = dataDir || path.join(os.homedir(), '.openclaw');
    this.dataPath = path.join(baseDir, 'budget');
    this.limits = { ...DEFAULT_LIMITS };

    this.ensureDir();
    this.loadData();
  }

  // ── Set alert callback ──

  onAlert(callback: (alert: BudgetAlert) => void): void {
    this.alertCallback = callback;
  }

  // ── Record usage ──

  recordUsage(record: Omit<UsageRecord, 'timestamp'>): BudgetAlert | null {
    const entry: UsageRecord = {
      ...record,
      timestamp: Date.now(),
    };

    this.records.push(entry);
    this.saveRecords();

    // Check for budget violations
    return this.checkBudgets();
  }

  // ── Get current status ──

  getStatus(): BudgetStatus {
    const now = Date.now();
    const dayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    const dailyRecords = this.records.filter(r => r.timestamp >= dayStart);
    const weeklyRecords = this.records.filter(r => r.timestamp >= weekStart);
    const monthlyRecords = this.records.filter(r => r.timestamp >= monthStart);

    const dailyUsed = sumCost(dailyRecords);
    const weeklyUsed = sumCost(weeklyRecords);
    const monthlyUsed = sumCost(monthlyRecords);

    // Model breakdown (monthly)
    const modelBreakdown: Record<string, { count: number; costUSD: number }> = {};
    for (const r of monthlyRecords) {
      if (!modelBreakdown[r.modelId]) {
        modelBreakdown[r.modelId] = { count: 0, costUSD: 0 };
      }
      modelBreakdown[r.modelId].count++;
      modelBreakdown[r.modelId].costUSD += r.costUSD;
    }

    const totalSpent = sumCost(this.records);
    const totalRequests = this.records.length;

    return {
      daily: {
        used: dailyUsed,
        limit: this.limits.daily,
        percent: this.limits.daily > 0 ? Math.round((dailyUsed / this.limits.daily) * 100) : 0,
        exceeded: dailyUsed >= this.limits.daily,
      },
      weekly: {
        used: weeklyUsed,
        limit: this.limits.weekly,
        percent: this.limits.weekly > 0 ? Math.round((weeklyUsed / this.limits.weekly) * 100) : 0,
        exceeded: weeklyUsed >= this.limits.weekly,
      },
      monthly: {
        used: monthlyUsed,
        limit: this.limits.monthly,
        percent: this.limits.monthly > 0 ? Math.round((monthlyUsed / this.limits.monthly) * 100) : 0,
        exceeded: monthlyUsed >= this.limits.monthly,
      },
      totalSpent,
      totalRequests,
      avgCostPerRequest: totalRequests > 0 ? totalSpent / totalRequests : 0,
      modelBreakdown,
    };
  }

  // ── Set limits ──

  setLimits(limits: Partial<BudgetLimits>): void {
    if (limits.daily !== undefined) this.limits.daily = limits.daily;
    if (limits.weekly !== undefined) this.limits.weekly = limits.weekly;
    if (limits.monthly !== undefined) this.limits.monthly = limits.monthly;
    this.saveLimits();
  }

  getLimits(): BudgetLimits {
    return { ...this.limits };
  }

  // ── Subscription Advisor (from openclawvn) ──

  getSubscriptionAdvice(): { tier: 'free' | 'pro' | 'max'; reason: string; reasonVi: string } {
    const status = this.getStatus();
    const monthlySpend = status.monthly.used;

    if (monthlySpend < 2) {
      return {
        tier: 'free',
        reason: 'Free tier works well for your usage level.',
        reasonVi: 'Bạn đang dùng Free tier. Nâng cấp để có thêm tính năng.',
      };
    }
    if (monthlySpend < 10) {
      return {
        tier: 'pro',
        reason: 'Pro plan ($9.99/mo) would save you money at this usage level.',
        reasonVi: 'Gợi ý: Gói Pro phù hợp với mức sử dụng hiện tại của bạn.',
      };
    }
    return {
      tier: 'max',
      reason: 'Max plan ($29.99/mo) would save you significantly at high usage.',
      reasonVi: 'Gợi ý: Gói Max sẽ tiết kiệm hơn với mức dùng cao của bạn.',
    };
  }

  // ── Check if request is allowed ──

  canMakeRequest(estimatedCostUSD: number): { allowed: boolean; reason?: string } {
    const status = this.getStatus();

    if (status.daily.used + estimatedCostUSD > this.limits.daily) {
      return { allowed: false, reason: `Sẽ vượt ngân sách ngày ($${this.limits.daily})` };
    }
    if (status.weekly.used + estimatedCostUSD > this.limits.weekly) {
      return { allowed: false, reason: `Sẽ vượt ngân sách tuần ($${this.limits.weekly})` };
    }
    if (status.monthly.used + estimatedCostUSD > this.limits.monthly) {
      return { allowed: false, reason: `Sẽ vượt ngân sách tháng ($${this.limits.monthly})` };
    }
    return { allowed: true };
  }

  // ── Get alerts ──

  getAlerts(since?: number): BudgetAlert[] {
    if (since) {
      return this.alerts.filter(a => a.timestamp >= since);
    }
    return [...this.alerts];
  }

  // ── Clear old records (data retention) ──

  purgeOldRecords(keepDays = 90): number {
    const cutoff = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
    const before = this.records.length;
    this.records = this.records.filter(r => r.timestamp >= cutoff);
    const removed = before - this.records.length;
    if (removed > 0) this.saveRecords();
    return removed;
  }

  // ── Internal ──

  private checkBudgets(): BudgetAlert | null {
    const status = this.getStatus();
    let highestAlert: BudgetAlert | null = null;

    for (const period of ['daily', 'weekly', 'monthly'] as const) {
      const s = status[period];
      if (s.exceeded) {
        const alert: BudgetAlert = {
          type: 'exceeded',
          period,
          percent: s.percent,
          used: s.used,
          limit: s.limit,
          timestamp: Date.now(),
        };
        this.alerts.push(alert);
        this.alertCallback?.(alert);
        highestAlert = alert;
      } else if (s.percent >= WARNING_THRESHOLD) {
        const alert: BudgetAlert = {
          type: 'warning',
          period,
          percent: s.percent,
          used: s.used,
          limit: s.limit,
          timestamp: Date.now(),
        };
        this.alerts.push(alert);
        this.alertCallback?.(alert);
        if (!highestAlert) highestAlert = alert;
      }
    }

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    return highestAlert;
  }

  private ensureDir(): void {
    try { fs.mkdirSync(this.dataPath, { recursive: true }); } catch { /* ignore */ }
  }

  private loadData(): void {
    // Load limits
    try {
      const limitsFile = path.join(this.dataPath, 'limits.json');
      if (fs.existsSync(limitsFile)) {
        const data = JSON.parse(fs.readFileSync(limitsFile, 'utf-8'));
        this.limits = { ...DEFAULT_LIMITS, ...data };
      }
    } catch { /* use defaults */ }

    // Load records
    try {
      const recordsFile = path.join(this.dataPath, 'records.json');
      if (fs.existsSync(recordsFile)) {
        this.records = JSON.parse(fs.readFileSync(recordsFile, 'utf-8'));
      }
    } catch { this.records = []; }

    // Purge >90 days old on load
    this.purgeOldRecords(90);
  }

  private saveLimits(): void {
    try {
      fs.writeFileSync(
        path.join(this.dataPath, 'limits.json'),
        JSON.stringify(this.limits, null, 2),
        'utf-8',
      );
    } catch (err) {
      console.warn('[BudgetManager] Failed to save limits:', err);
    }
  }

  private saveRecords(): void {
    try {
      fs.writeFileSync(
        path.join(this.dataPath, 'records.json'),
        JSON.stringify(this.records),
        'utf-8',
      );
    } catch (err) {
      console.warn('[BudgetManager] Failed to save records:', err);
    }
  }
}

// ── Date Helpers ──

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d.getTime();
}

function startOfMonth(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

function sumCost(records: UsageRecord[]): number {
  return records.reduce((sum, r) => sum + r.costUSD, 0);
}
