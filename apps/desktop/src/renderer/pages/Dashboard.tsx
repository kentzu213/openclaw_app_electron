import React, { useState, useEffect } from 'react';

interface DashboardPageProps {
  user: any;
  onRefresh?: () => void;
  onOpenClawQuickInstall?: () => void;
  onBuyApi?: () => void;
}

export function DashboardPage({ user, onRefresh, onOpenClawQuickInstall, onBuyApi }: DashboardPageProps) {
  const [syncStatus, setSyncStatus] = useState<string>('idle');
  const [extensionCount, setExtensionCount] = useState(0);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      if (window.electronAPI) {
        const extensions = await window.electronAPI.extensions.list();
        setExtensionCount(extensions.length);

        const status = await window.electronAPI.sync.status();
        if (status.lastSynced) setLastSynced(status.lastSynced);
      }
    } catch {}
  }

  async function handleSync() {
    setSyncStatus('syncing');
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.sync.start();
        setSyncStatus(result.status);
        if (result.lastSynced) setLastSynced(result.lastSynced);
        // Refresh user profile after sync
        onRefresh?.();
      } else {
        await new Promise(r => setTimeout(r, 2000));
        setSyncStatus('success');
      }
    } catch {
      setSyncStatus('error');
    }
  }

  function formatBalance(balance: number | undefined): string {
    if (balance === undefined || balance === null) return '$0.00';
    return `$${balance.toFixed(2)}`;
  }

  function formatPlan(plan: string | undefined): string {
    if (!plan) return 'Free';
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  }

  const stats = [
    { icon: '💰', value: formatBalance(user?.balance), label: 'Số dư tài khoản', change: formatPlan(user?.plan), changeType: 'up' as const },
    { icon: '🔑', value: String(user?.activeKeys || 0), label: 'API Keys đang hoạt động', change: 'Active', changeType: 'up' as const },
    { icon: '🧩', value: String(extensionCount), label: 'Tiện ích đã cài', change: 'Installed', changeType: 'up' as const },
    { icon: '⚡', value: user?.role === 'admin' ? 'Admin' : 'User', label: 'Vai trò', change: formatPlan(user?.plan), changeType: 'up' as const },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-header__title">
          Xin chào, {user?.name || 'User'} 👋
        </h1>
        <p className="page-header__subtitle">
          Tổng quan hệ thống Starizzi — kết nối IzziAPI.com
        </p>
      </div>

      {/* Sync Status */}
      <div style={{ marginBottom: 'var(--space-xl)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span className={`sync-badge sync-badge--${syncStatus}`}>
          <span className="sync-badge__icon">
            {syncStatus === 'syncing' ? '🔄' : syncStatus === 'success' ? '✅' : syncStatus === 'error' ? '❌' : '⏸️'}
          </span>
          {syncStatus === 'syncing' ? 'Đang đồng bộ...' :
           syncStatus === 'success' ? 'Đã đồng bộ' :
           syncStatus === 'error' ? 'Lỗi đồng bộ' : 'Chờ đồng bộ'}
        </span>
        <button className="btn btn--ghost btn--sm" onClick={handleSync} disabled={syncStatus === 'syncing'}>
          🔄 Đồng bộ ngay
        </button>
        {lastSynced && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
            Lần cuối: {new Date(lastSynced).toLocaleString('vi-VN')}
          </span>
        )}
      </div>

      {/* Main product flow */}
      <div className="card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(59, 130, 246, 0.12))' }}>
        <div className="card__header">
          <h3 className="card__title">🎯 Hai tính năng chính cần dùng ngay</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          <PrimaryFlowCard
            icon="⚙️"
            title="Cài nhanh OpenClaw"
            description="Mở nhanh OpenClaw đã có trên máy, hoặc mở docs cài đặt nếu chưa có."
            buttonText="Mở / cài OpenClaw"
            onClick={onOpenClawQuickInstall}
          />
          <PrimaryFlowCard
            icon="💳"
            title="Mua API trên IzziAPI"
            description="Đi thẳng tới trang pricing để đăng ký gói và mua API key dùng thực chiến."
            buttonText="Mua API ngay"
            onClick={onBuyApi}
          />
        </div>
      </div>

      {/* Account Info Banner */}
      <div className="card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.1))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '8px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', fontWeight: 700, color: '#fff',
          }}>
            {user?.avatar || user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>{user?.email || 'N/A'}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Plan: <strong style={{ color: 'var(--color-primary)' }}>{formatPlan(user?.plan)}</strong>
              {' | '}
              Balance: <strong style={{ color: '#34d399' }}>{formatBalance(user?.balance)}</strong>
            </div>
          </div>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => window.electronAPI?.shell.openExternal('https://izziapi.com/dashboard/overview')}
          >
            Dashboard Web →
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {stats.map((stat, i) => (
          <div key={i} className="stat-card animate-in">
            <div className="stat-card__icon">{stat.icon}</div>
            <div className="stat-card__value">{stat.value}</div>
            <div className="stat-card__label">{stat.label}</div>
            <div className={`stat-card__change stat-card__change--${stat.changeType}`}>
              {stat.change}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card__header">
          <h3 className="card__title">🚀 Bắt đầu nhanh</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <QuickAction
            icon="🔑"
            title="Quản lý API Key"
            description="Xem và quản lý API keys"
            onClick={() => window.electronAPI?.shell.openExternal('https://izziapi.com/dashboard/keys')}
          />
          <QuickAction
            icon="⚙️"
            title="Cài nhanh OpenClaw"
            description="Bật OpenClaw hoặc mở docs cài đặt"
            onClick={onOpenClawQuickInstall}
          />
          <QuickAction
            icon="🏪"
            title="Khám phá Marketplace"
            description="Tìm tiện ích mở rộng mới"
          />
          <QuickAction
            icon="📚"
            title="Tài liệu API"
            description="Đọc docs IzziAPI.com"
            onClick={() => window.electronAPI?.shell.openExternal('https://izziapi.com/docs')}
          />
          <QuickAction
            icon="💳"
            title="Mua API ngay"
            description="Đi tới pricing của IzziAPI.com"
            onClick={onBuyApi}
          />
          <QuickAction
            icon="💡"
            title="Đăng bán Extension"
            description="Tạo và bán tiện ích của bạn"
            onClick={() => window.electronAPI?.shell.openExternal('https://izziapi.com/dashboard/billing')}
          />
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon, title, description, onClick }: {
  icon: string; title: string; description: string; onClick?: () => void;
}) {
  return (
    <div
      className="stat-card"
      style={{ cursor: 'pointer', padding: '16px' }}
      onClick={onClick}
    >
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>{description}</div>
    </div>
  );
}

function PrimaryFlowCard({ icon, title, description, buttonText, onClick }: {
  icon: string;
  title: string;
  description: string;
  buttonText: string;
  onClick?: () => void;
}) {
  return (
    <div className="card" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ fontSize: '28px', marginBottom: '10px' }}>{icon}</div>
      <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
        {description}
      </div>
      <button className="btn btn--primary btn--sm" onClick={onClick}>
        {buttonText}
      </button>
    </div>
  );
}
