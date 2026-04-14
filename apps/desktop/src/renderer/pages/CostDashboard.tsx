import React, { useEffect, useState, useCallback } from 'react';

// ── Types (mirrored from backend) ──

interface BudgetPeriod {
  used: number;
  limit: number;
  percent: number;
  exceeded: boolean;
}

interface BudgetStatus {
  daily: BudgetPeriod;
  weekly: BudgetPeriod;
  monthly: BudgetPeriod;
  totalSpent: number;
  totalRequests: number;
  avgCostPerRequest: number;
  modelBreakdown: Record<string, { count: number; costUSD: number }>;
}

interface BudgetLimits {
  daily: number;
  weekly: number;
  monthly: number;
}

interface CostDashboardPageProps {
  t: any; // Translation object
}

// ── Component ──

export function CostDashboardPage({ t }: CostDashboardPageProps) {
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [limits, setLimits] = useState<BudgetLimits>({ daily: 1, weekly: 5, monthly: 15 });
  const [advice, setAdvice] = useState<{ tier: string; reasonVi: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editLimits, setEditLimits] = useState<BudgetLimits>({ daily: 1, weekly: 5, monthly: 15 });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      if (!window.electronAPI?.budget) return;
      const [s, l, a] = await Promise.all([
        window.electronAPI.budget.getStatus(),
        window.electronAPI.budget.getLimits(),
        window.electronAPI.budget.getAdvice(),
      ]);
      setStatus(s);
      setLimits(l);
      setEditLimits(l);
      setAdvice(a);
    } catch (err) {
      console.warn('[CostDashboard] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    // Refresh every 30s
    const interval = setInterval(() => void loadData(), 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ── Save limits ──

  async function saveLimits() {
    try {
      await window.electronAPI?.budget.setLimits(editLimits);
      setLimits(editLimits);
      setEditing(false);
      await loadData();
    } catch { /* ignore */ }
  }

  // ── Format helpers ──

  const fmtUSD = (n: number) => `$${n.toFixed(4)}`;
  const fmtVND = (n: number) => `${Math.round(n * 25500).toLocaleString('vi-VN')}₫`;
  const fmtPercent = (n: number) => `${Math.min(n, 100)}%`;

  // ── Render ──

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <span>{t?.app?.loading || 'Loading...'}</span>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div style={styles.container}>
        <h2 style={styles.title}>{t?.cost?.dashboardTitle || '💰 Cost Management'}</h2>
        <div style={styles.emptyState}>
          <span style={styles.emptyIcon}>📊</span>
          <p>{t?.cost?.noData || 'No spending data yet'}</p>
        </div>
      </div>
    );
  }

  const periods: Array<{ key: 'daily' | 'weekly' | 'monthly'; data: BudgetPeriod }> = [
    { key: 'daily', data: status.daily },
    { key: 'weekly', data: status.weekly },
    { key: 'monthly', data: status.monthly },
  ];

  const periodLabels = {
    daily: t?.cost?.period?.daily || 'Daily',
    weekly: t?.cost?.period?.weekly || 'Weekly',
    monthly: t?.cost?.period?.monthly || 'Monthly',
  };

  // Sort model breakdown by cost desc
  const modelEntries = Object.entries(status.modelBreakdown)
    .sort(([, a], [, b]) => b.costUSD - a.costUSD);

  return (
    <div style={styles.container}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>{t?.cost?.dashboardTitle || '💰 Cost Management'}</h2>
          <p style={styles.subtitle}>{t?.cost?.dashboardDesc || 'Track spending and optimize your AI budget'}</p>
        </div>
        <button style={styles.refreshBtn} onClick={() => void loadData()}>
          🔄 {t?.app?.refresh || 'Refresh'}
        </button>
      </div>

      {/* ── Budget Cards ── */}
      <div style={styles.cardsGrid}>
        {periods.map(({ key, data }) => (
          <div key={key} style={{
            ...styles.card,
            borderLeft: `4px solid ${data.exceeded ? '#ef4444' : data.percent >= 80 ? '#f59e0b' : '#4ade80'}`,
          }}>
            <div style={styles.cardHeader}>
              <span style={styles.cardLabel}>{periodLabels[key]}</span>
              {data.exceeded && <span style={styles.badge}>⚠️</span>}
            </div>
            {/* Progress bar */}
            <div style={styles.progressBg}>
              <div style={{
                ...styles.progressFill,
                width: `${Math.min(data.percent, 100)}%`,
                background: data.exceeded ? '#ef4444' : data.percent >= 80 ? '#f59e0b' : 'linear-gradient(90deg, #4ade80, #22d3ee)',
              }} />
            </div>
            <div style={styles.cardRow}>
              <span>{t?.cost?.spent || 'Spent'}: <strong>{fmtUSD(data.used)}</strong></span>
              <span>{fmtPercent(data.percent)}</span>
            </div>
            <div style={styles.cardRow}>
              <span style={styles.muted}>{t?.cost?.limit || 'Limit'}: {fmtUSD(data.limit)}</span>
              <span style={styles.muted}>{t?.cost?.remaining || 'Remaining'}: {fmtUSD(Math.max(0, data.limit - data.used))}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Summary Stats ── */}
      <div style={styles.statsRow}>
        <div style={styles.statBox}>
          <span style={styles.statValue}>{fmtUSD(status.totalSpent)}</span>
          <span style={styles.statLabel}>{t?.cost?.totalSpent || 'Total Spent'}</span>
          <span style={styles.statSub}>{fmtVND(status.totalSpent)}</span>
        </div>
        <div style={styles.statBox}>
          <span style={styles.statValue}>{status.totalRequests}</span>
          <span style={styles.statLabel}>{t?.cost?.requests || 'Requests'}</span>
        </div>
        <div style={styles.statBox}>
          <span style={styles.statValue}>{fmtUSD(status.avgCostPerRequest)}</span>
          <span style={styles.statLabel}>{t?.cost?.avgPerRequest || 'Avg/Request'}</span>
        </div>
      </div>

      {/* ── Model Breakdown ── */}
      {modelEntries.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>{t?.cost?.modelUsage || 'Usage by Model'}</h3>
          <div style={styles.modelList}>
            {modelEntries.map(([modelId, { count, costUSD }]) => {
              const pct = status.monthly.used > 0 ? Math.round((costUSD / status.monthly.used) * 100) : 0;
              return (
                <div key={modelId} style={styles.modelRow}>
                  <div style={styles.modelInfo}>
                    <span style={styles.modelName}>{modelId}</span>
                    <span style={styles.muted}>{count} {t?.cost?.requests || 'requests'}</span>
                  </div>
                  <div style={styles.modelBar}>
                    <div style={{ ...styles.modelBarFill, width: `${pct}%` }} />
                  </div>
                  <span style={styles.modelCost}>{fmtUSD(costUSD)} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Budget Limits Editor ── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>{t?.cost?.alertSettings || 'Alert Settings'}</h3>
          {!editing ? (
            <button style={styles.editBtn} onClick={() => setEditing(true)}>
              ✏️ {t?.app?.edit || 'Edit'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.saveBtn} onClick={saveLimits}>💾 {t?.app?.save || 'Save'}</button>
              <button style={styles.cancelBtn} onClick={() => { setEditing(false); setEditLimits(limits); }}>
                {t?.app?.cancel || 'Cancel'}
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div style={styles.limitsGrid}>
            {(['daily', 'weekly', 'monthly'] as const).map(key => (
              <div key={key} style={styles.limitField}>
                <label style={styles.limitLabel}>{periodLabels[key]}</label>
                <div style={styles.inputGroup}>
                  <span style={styles.inputPrefix}>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editLimits[key]}
                    onChange={e => setEditLimits({ ...editLimits, [key]: parseFloat(e.target.value) || 0 })}
                    style={styles.input}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.limitsGrid}>
            {(['daily', 'weekly', 'monthly'] as const).map(key => (
              <div key={key} style={styles.limitDisplay}>
                <span style={styles.muted}>{periodLabels[key]}:</span>
                <span style={styles.limitValue}>{fmtUSD(limits[key])}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Subscription Advice ── */}
      {advice && (
        <div style={{
          ...styles.adviceBox,
          borderColor: advice.tier === 'max' ? '#f59e0b' : advice.tier === 'pro' ? '#22d3ee' : '#4ade80',
        }}>
          <span style={styles.adviceIcon}>
            {advice.tier === 'max' ? '🚀' : advice.tier === 'pro' ? '⭐' : '✅'}
          </span>
          <span>{advice.reasonVi || t?.cost?.subscriptionAdvice?.[advice.tier] || ''}</span>
        </div>
      )}
    </div>
  );
}

// ── Styles ──

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px 32px',
    maxWidth: 960,
    margin: '0 auto',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    color: '#e2e8f0',
  },
  loading: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 12, height: 300, color: '#94a3b8',
  },
  spinner: {
    width: 20, height: 20, border: '2px solid rgba(255,255,255,0.1)',
    borderTop: '2px solid #22d3ee', borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: {
    fontSize: 22, fontWeight: 700, margin: 0, color: '#f1f5f9',
  },
  subtitle: {
    fontSize: 13, color: '#94a3b8', marginTop: 4,
  },
  refreshBtn: {
    background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)',
    color: '#22d3ee', padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 500,
  },
  cardsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24,
  },
  card: {
    background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 16,
    border: '1px solid rgba(255,255,255,0.06)',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  cardLabel: {
    fontSize: 14, fontWeight: 600, color: '#cbd5e1',
  },
  badge: {
    fontSize: 14,
  },
  progressBg: {
    height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3,
    marginBottom: 10, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 3, transition: 'width 0.6s ease',
  },
  cardRow: {
    display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4,
  },
  muted: {
    color: '#64748b', fontSize: 12,
  },
  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24,
  },
  statBox: {
    textAlign: 'center' as const, background: 'rgba(15,23,42,0.4)',
    borderRadius: 12, padding: '16px 12px',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  statValue: {
    display: 'block', fontSize: 20, fontWeight: 700, color: '#22d3ee',
  },
  statLabel: {
    display: 'block', fontSize: 12, color: '#94a3b8', marginTop: 4,
  },
  statSub: {
    display: 'block', fontSize: 11, color: '#64748b', marginTop: 2,
  },
  section: {
    background: 'rgba(15,23,42,0.4)', borderRadius: 12, padding: 20,
    border: '1px solid rgba(255,255,255,0.06)', marginBottom: 20,
  },
  sectionHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15, fontWeight: 600, margin: 0, color: '#cbd5e1',
  },
  modelList: {
    display: 'flex', flexDirection: 'column' as const, gap: 10,
  },
  modelRow: {
    display: 'grid', gridTemplateColumns: '1fr 120px 100px', gap: 12, alignItems: 'center',
  },
  modelInfo: {
    display: 'flex', flexDirection: 'column' as const,
  },
  modelName: {
    fontSize: 13, fontWeight: 500, color: '#e2e8f0',
  },
  modelBar: {
    height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden',
  },
  modelBarFill: {
    height: '100%', borderRadius: 3,
    background: 'linear-gradient(90deg, #818cf8, #c084fc)',
    transition: 'width 0.5s ease',
  },
  modelCost: {
    fontSize: 12, color: '#94a3b8', textAlign: 'right' as const,
  },
  limitsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
  },
  limitField: {
    display: 'flex', flexDirection: 'column' as const, gap: 6,
  },
  limitLabel: {
    fontSize: 12, fontWeight: 500, color: '#94a3b8',
  },
  inputGroup: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'rgba(15,23,42,0.6)', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px',
  },
  inputPrefix: {
    color: '#64748b', fontSize: 13,
  },
  input: {
    background: 'transparent', border: 'none', color: '#e2e8f0',
    fontSize: 14, width: '100%', outline: 'none',
  },
  limitDisplay: {
    display: 'flex', justifyContent: 'space-between', padding: '8px 0',
  },
  limitValue: {
    fontWeight: 600, color: '#22d3ee',
  },
  editBtn: {
    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
    color: '#94a3b8', padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
    fontSize: 12,
  },
  saveBtn: {
    background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.3)',
    color: '#22d3ee', padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
    fontSize: 12,
  },
  cancelBtn: {
    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
    color: '#94a3b8', padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
    fontSize: 12,
  },
  adviceBox: {
    display: 'flex', alignItems: 'center', gap: 12, padding: 16,
    background: 'rgba(15,23,42,0.4)', borderRadius: 12,
    border: '1px solid', fontSize: 14, color: '#cbd5e1',
  },
  adviceIcon: {
    fontSize: 20,
  },
  emptyState: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    justifyContent: 'center', height: 300, gap: 12, color: '#64748b',
  },
  emptyIcon: {
    fontSize: 48,
  },
};
