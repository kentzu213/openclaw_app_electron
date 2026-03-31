import React, { useState, useEffect } from 'react';

interface InstalledExtension {
  id: string;
  name: string;
  displayName: string;
  version: string;
  description?: string;
  author?: string;
  isEnabled: boolean;
  installedAt: string;
}

export function ExtensionsPage({ onGoMarketplace, onOpenClawQuickInstall }: { onGoMarketplace?: () => void; onOpenClawQuickInstall?: () => void; }) {
  const [extensions, setExtensions] = useState<InstalledExtension[]>([]);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);

  useEffect(() => {
    loadExtensions();
  }, []);

  async function loadExtensions() {
    try {
      if (window.electronAPI) {
        const list = await window.electronAPI.extensions.list();
        setExtensions(list);
      }
    } catch (err) {
      console.error('Failed to load extensions:', err);
    }
  }

  async function handleUninstall(extId: string) {
    setUninstallingId(extId);
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.extensions.uninstall(extId);
        if (result.success) {
          setExtensions(prev => prev.filter(e => e.id !== extId));
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setExtensions(prev => prev.filter(e => e.id !== extId));
      }
    } catch (err) {
      console.error('Uninstall failed:', err);
    }
    setUninstallingId(null);
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-header__title">🧩 Tiện ích mở rộng</h1>
        <p className="page-header__subtitle">
          Quản lý các tiện ích đã cài đặt trên Starizzi
        </p>
      </div>

      {extensions.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon">🧩</div>
            <h3 className="empty-state__title">Chưa có tiện ích nào</h3>
            <p className="empty-state__description">
              Truy cập Marketplace để khám phá và cài đặt các tiện ích mở rộng giúp tăng hiệu quả công việc.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn--primary" onClick={onGoMarketplace}>🏪 Đi đến Marketplace</button>
              <button className="btn btn--ghost" onClick={onOpenClawQuickInstall}>⚙️ Mở / cài OpenClaw</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {extensions.map((ext, i) => (
            <div key={ext.id} className="card animate-in" style={{ animationDelay: `${i * 60}ms` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div className="ext-card__icon" style={{ width: 44, height: 44, fontSize: 22 }}>🧩</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '15px' }}>{ext.displayName || ext.name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>v{ext.version}</span>
                    <span className={`sync-badge sync-badge--${ext.isEnabled ? 'success' : 'idle'}`}>
                      {ext.isEnabled ? '✅ Active' : '⏸️ Disabled'}
                    </span>
                  </div>
                  {ext.description && (
                    <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>
                      {ext.description}
                    </p>
                  )}
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                    {ext.author && <span>by {ext.author} · </span>}
                    <span>Cài lúc: {new Date(ext.installedAt).toLocaleDateString('vi-VN')}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn--ghost btn--sm">⚙️ Cấu hình</button>
                  <button
                    className="btn btn--danger btn--sm"
                    onClick={() => handleUninstall(ext.id)}
                    disabled={uninstallingId === ext.id}
                  >
                    {uninstallingId === ext.id ? '⏳ Đang gỡ...' : '🗑️ Gỡ cài đặt'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
