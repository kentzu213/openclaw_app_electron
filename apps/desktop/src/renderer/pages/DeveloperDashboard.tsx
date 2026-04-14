import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';

interface DevExtension {
  id: string;
  name: string;
  displayName: string;
  version: string;
  installs: number;
  rating: number;
  status: string;
  created_at: string;
}

interface DevStats {
  total_extensions: number;
  total_installs: number;
  avg_rating: number;
  total_revenue: number;
}

// Demo data for offline/browser mode
const DEMO_EXTENSIONS: DevExtension[] = [
  { id: 'ext-1', name: 'smart-seo-scanner', displayName: 'Smart SEO Scanner', version: '1.2.0', installs: 1240, rating: 4.8, status: 'published', created_at: '2026-02-15T00:00:00Z' },
  { id: 'ext-2', name: 'auto-email-composer', displayName: 'Auto Email Composer', version: '2.0.1', installs: 890, rating: 4.5, status: 'published', created_at: '2026-03-01T00:00:00Z' },
  { id: 'ext-3', name: 'chatbot-builder', displayName: 'Chatbot Builder Pro', version: '0.9.0', installs: 0, rating: 0, status: 'draft', created_at: '2026-03-20T00:00:00Z' },
];

const DEMO_STATS: DevStats = {
  total_extensions: 3,
  total_installs: 2130,
  avg_rating: 4.65,
  total_revenue: 12450,
};

export function DeveloperDashboardPage({ onBack }: { onBack: () => void }) {
  const [extensions, setExtensions] = useState<DevExtension[]>([]);
  const [stats, setStats] = useState<DevStats>(DEMO_STATS);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'published' | 'draft'>('all');

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const res = await apiClient.getDeveloperDashboard();
      if (res.extensions?.length > 0) {
        setExtensions(res.extensions);
        if (res.stats) setStats(res.stats);
      } else {
        setExtensions(DEMO_EXTENSIONS);
      }
    } catch {
      setExtensions(DEMO_EXTENSIONS);
    }
    setLoading(false);
  }

  const filteredExtensions = activeFilter === 'all'
    ? extensions
    : extensions.filter(e => e.status === activeFilter);

  function renderStars(rating: number): string {
    if (rating === 0) return '—';
    const full = Math.floor(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  function formatNumber(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('vi-VN', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const statCards = [
    { icon: '📦', label: 'Extensions', value: String(stats.total_extensions), color: '#636eff' },
    { icon: '📥', label: 'Tổng lượt cài', value: formatNumber(stats.total_installs), color: '#00b894' },
    { icon: '⭐', label: 'Rating TB', value: stats.avg_rating > 0 ? stats.avg_rating.toFixed(1) : '—', color: '#fdcb6e' },
    { icon: '💰', label: 'Doanh thu', value: `$${formatNumber(stats.total_revenue)}`, color: '#e17055' },
  ];

  const statusBadge: Record<string, { label: string; color: string; bg: string }> = {
    published: { label: 'Đã xuất bản', color: '#00b894', bg: 'rgba(0,184,148,0.1)' },
    draft: { label: 'Bản nháp', color: '#fdcb6e', bg: 'rgba(253,203,110,0.1)' },
    pending: { label: 'Chờ duyệt', color: '#74b9ff', bg: 'rgba(116,185,255,0.1)' },
    rejected: { label: 'Bị từ chối', color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)' },
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <button className="ext-detail__back" onClick={onBack}>
            ← Quay lại Marketplace
          </button>
          <h1 className="page-header__title">👨‍💻 Developer Dashboard</h1>
          <p className="page-header__subtitle">
            Quản lý tiện ích và theo dõi hiệu suất của bạn
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="dev-dash__stats">
        {statCards.map((s, i) => (
          <div key={i} className="dev-dash__stat-card animate-in" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="dev-dash__stat-icon" style={{ background: `${s.color}15`, color: s.color }}>
              {s.icon}
            </div>
            <div className="dev-dash__stat-value">{s.value}</div>
            <div className="dev-dash__stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="dev-dash__filters">
        {(['all', 'published', 'draft'] as const).map(f => (
          <button
            key={f}
            className={`filter-pill ${activeFilter === f ? 'filter-pill--active' : ''}`}
            onClick={() => setActiveFilter(f)}
          >
            {f === 'all' ? 'Tất cả' : f === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
            <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
              {f === 'all' ? extensions.length : extensions.filter(e => e.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* Extensions Table */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>Đang tải dữ liệu...</p>
        </div>
      ) : filteredExtensions.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon">📭</div>
            <h3 className="empty-state__title">Chưa có extension nào</h3>
            <p className="empty-state__description">
              Bắt đầu đăng tải tiện ích đầu tiên của bạn lên Marketplace!
            </p>
            <button className="btn btn--primary" onClick={onBack}>
              🚀 Đăng tải ngay
            </button>
          </div>
        </div>
      ) : (
        <div className="dev-dash__ext-list">
          {filteredExtensions.map((ext, i) => {
            const badge = statusBadge[ext.status] || statusBadge.draft;
            return (
              <div key={ext.id} className="dev-dash__ext-card animate-in" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="dev-dash__ext-icon">📦</div>
                <div className="dev-dash__ext-info">
                  <div className="dev-dash__ext-header">
                    <span className="dev-dash__ext-name">{ext.displayName}</span>
                    <span className="dev-dash__ext-version">v{ext.version}</span>
                    <span
                      className="dev-dash__ext-status"
                      style={{ color: badge.color, background: badge.bg }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="dev-dash__ext-meta">
                    <span>📥 {formatNumber(ext.installs)} lượt cài</span>
                    <span className="dev-dash__ext-separator">•</span>
                    <span style={{ color: '#fdcb6e' }}>{renderStars(ext.rating)}</span>
                    {ext.rating > 0 && <span> {ext.rating.toFixed(1)}</span>}
                    <span className="dev-dash__ext-separator">•</span>
                    <span>📅 {formatDate(ext.created_at)}</span>
                  </div>
                </div>
                <div className="dev-dash__ext-actions">
                  {ext.status === 'draft' && (
                    <button className="btn btn--primary btn--sm">📤 Xuất bản</button>
                  )}
                  <button className="btn btn--ghost btn--sm">📊 Chi tiết</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
