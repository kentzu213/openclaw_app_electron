import React, { useState, useEffect, useCallback } from 'react';
import { PermissionDialog } from '../components/PermissionDialog';

interface RuntimeExtension {
  id: string;
  name: string;
  displayName: string;
  version: string;
  description?: string;
  author?: string;
  state: 'installed' | 'running' | 'stopped' | 'crashed' | 'disabled';
  permissions: string[];
  grantedPermissions: string[];
  categories?: string[];
}

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

const STATE_BADGES: Record<string, { label: string; className: string; icon: string }> = {
  running:   { label: 'Đang chạy',    className: 'sync-badge--success', icon: '🟢' },
  installed: { label: 'Đã cài',       className: 'sync-badge--idle',    icon: '⚪' },
  stopped:   { label: 'Đã dừng',      className: 'sync-badge--idle',    icon: '⏹️' },
  crashed:   { label: 'Lỗi',          className: 'sync-badge--error',   icon: '🔴' },
  disabled:  { label: 'Vô hiệu hóa', className: 'sync-badge--warning', icon: '⏸️' },
};

export function ExtensionsPage({
  onGoMarketplace,
  onOpenClawQuickInstall,
}: {
  onGoMarketplace?: () => void;
  onOpenClawQuickInstall?: () => void;
}) {
  const [runtimeExts, setRuntimeExts] = useState<RuntimeExtension[]>([]);
  const [legacyExts, setLegacyExts] = useState<InstalledExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [permDialogExt, setPermDialogExt] = useState<RuntimeExtension | null>(null);
  const [permDefinitions, setPermDefinitions] = useState<any[]>([]);
  const [notification, setNotification] = useState<{ message: string; type: string } | null>(null);

  const showNotif = useCallback((message: string, type: string = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Load extensions
  const loadExtensions = useCallback(async () => {
    try {
      if (window.electronAPI) {
        // Try runtime list first (Sprint 2B)
        const runtime = await window.electronAPI.extensionRuntime?.list?.();
        if (runtime && runtime.length > 0) {
          setRuntimeExts(runtime);
        }
        // Also load legacy list
        const legacy = await window.electronAPI.extensions.list();
        setLegacyExts(legacy);
      }
    } catch (err) {
      console.error('Failed to load extensions:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadExtensions();
  }, [loadExtensions]);

  // Listen for extension UI requests (notifications from running extensions)
  useEffect(() => {
    if (window.electronAPI?.extensionRuntime?.onUIRequest) {
      window.electronAPI.extensionRuntime.onUIRequest((data: any) => {
        if (data.action === 'showNotification') {
          showNotif(`[${data.extensionId}] ${data.args[0]}`, data.args[1] || 'info');
        }
      });
    }
  }, [showNotif]);

  async function handleStart(extId: string) {
    setActioningId(extId);
    try {
      const result = await window.electronAPI?.extensionRuntime?.start(extId);
      if (result?.success) {
        showNotif('Tiện ích đã khởi chạy', 'success');
      } else {
        showNotif(result?.error || 'Khởi chạy thất bại', 'error');
      }
    } catch (err: any) {
      showNotif(err.message, 'error');
    }
    setActioningId(null);
    loadExtensions();
  }

  async function handleStop(extId: string) {
    setActioningId(extId);
    try {
      await window.electronAPI?.extensionRuntime?.stop(extId);
      showNotif('Tiện ích đã dừng', 'info');
    } catch (err: any) {
      showNotif(err.message, 'error');
    }
    setActioningId(null);
    loadExtensions();
  }

  async function handleToggleEnable(ext: RuntimeExtension) {
    setActioningId(ext.id);
    try {
      if (ext.state === 'disabled') {
        await window.electronAPI?.extensionRuntime?.enable(ext.id);
        showNotif('Đã bật tiện ích', 'success');
      } else {
        await window.electronAPI?.extensionRuntime?.disable(ext.id);
        showNotif('Đã vô hiệu hóa tiện ích', 'info');
      }
    } catch (err: any) {
      showNotif(err.message, 'error');
    }
    setActioningId(null);
    loadExtensions();
  }

  async function handleUninstall(extId: string) {
    setActioningId(extId);
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.extensions.uninstall(extId);
        if (result.success) {
          showNotif('Đã gỡ cài đặt', 'success');
        }
      }
    } catch (err: any) {
      showNotif(err.message, 'error');
    }
    setActioningId(null);
    loadExtensions();
  }

  async function handleShowPermissions(ext: RuntimeExtension) {
    try {
      const result = await window.electronAPI?.extensionRuntime?.permissions(ext.id);
      if (result?.success) {
        setPermDefinitions(result.definitions);
        setPermDialogExt(ext);
      }
    } catch (err) {
      console.error('Failed to load permissions:', err);
    }
  }

  async function handleGrantPermissions(permissions: string[]) {
    if (!permDialogExt) return;
    try {
      await window.electronAPI?.extensionRuntime?.grantPermissions(permDialogExt.id, permissions);
      showNotif('Quyền đã được cập nhật', 'success');
    } catch (err: any) {
      showNotif(err.message, 'error');
    }
    setPermDialogExt(null);
    loadExtensions();
  }

  async function handleInstallOcx() {
    try {
      const result = await window.electronAPI?.extensionRuntime?.installOcx();
      if (result?.success) {
        showNotif(`Đã cài đặt: ${result.extension.displayName}`, 'success');
        loadExtensions();
      } else if (result?.error && result.error !== 'Cancelled') {
        showNotif(result.error, 'error');
      }
    } catch (err: any) {
      showNotif(err.message, 'error');
    }
  }

  const allExts = runtimeExts.length > 0 ? runtimeExts : legacyExts.map(e => ({
    id: e.id,
    name: e.name,
    displayName: e.displayName,
    version: e.version,
    description: e.description,
    author: e.author,
    state: (e.isEnabled ? 'installed' : 'disabled') as RuntimeExtension['state'],
    permissions: [],
    grantedPermissions: [],
  }));

  const runningCount = allExts.filter(e => e.state === 'running').length;
  const totalCount = allExts.length;

  return (
    <div>
      {/* Notification Toast */}
      {notification && (
        <div
          className={`notification-toast notification-toast--${notification.type}`}
          style={{
            position: 'fixed', top: '80px', right: '24px', zIndex: 9999,
            padding: '12px 20px', borderRadius: '10px',
            background: notification.type === 'error' ? 'rgba(239,68,68,0.15)' :
              notification.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(96,165,250,0.15)',
            border: `1px solid ${notification.type === 'error' ? 'rgba(239,68,68,0.3)' :
              notification.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(96,165,250,0.3)'}`,
            color: 'var(--color-text-primary)',
            fontSize: '14px', fontWeight: 500,
            animation: 'fadeIn 0.3s ease',
          }}
        >
          {notification.type === 'success' ? '✅' : notification.type === 'error' ? '❌' : 'ℹ️'}{' '}
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-header__title">🧩 Tiện ích mở rộng</h1>
            <p className="page-header__subtitle">
              Quản lý các tiện ích đã cài đặt trên Izzi OpenClaw
              {totalCount > 0 && (
                <span style={{ marginLeft: '12px', fontSize: '13px', color: 'var(--color-text-tertiary)' }}>
                  {runningCount}/{totalCount} đang chạy
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn--secondary btn--sm" onClick={handleInstallOcx} title="Cài từ file .ocx">
              📦 Cài .ocx
            </button>
            <button className="btn btn--primary btn--sm" onClick={onGoMarketplace}>
              🏪 Marketplace
            </button>
          </div>
        </div>
      </div>

      {/* Available Updates Panel */}
      {!loading && allExts.length > 0 && (
        <div className="ext-updates-panel animate-in">
          <div className="ext-updates-panel__header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="ext-updates-panel__icon">🔄</span>
              <span className="ext-updates-panel__title">Bản cập nhật có sẵn</span>
              <span className="ext-updates-panel__count">2</span>
            </div>
            <button className="btn btn--primary btn--sm">📥 Cập nhật tất cả</button>
          </div>
          <div className="ext-updates-panel__list">
            <div className="ext-updates-panel__item">
              <span>🧩</span>
              <span style={{ flex: 1 }}>Smart SEO Scanner</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>v1.1.0 → v1.2.0</span>
              <button className="btn btn--ghost btn--sm">Cập nhật</button>
            </div>
            <div className="ext-updates-panel__item">
              <span>🧩</span>
              <span style={{ flex: 1 }}>Chatbot Builder Pro</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>v0.8.5 → v0.9.0</span>
              <button className="btn btn--ghost btn--sm">Cập nhật</button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>Đang tải tiện ích...</p>
        </div>
      ) : allExts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon">🧩</div>
            <h3 className="empty-state__title">Chưa có tiện ích nào</h3>
            <p className="empty-state__description">
              Truy cập Marketplace để khám phá và cài đặt các tiện ích mở rộng giúp tăng hiệu quả công việc.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn--primary" onClick={onGoMarketplace}>🏪 Đi đến Marketplace</button>
              <button className="btn btn--secondary" onClick={handleInstallOcx}>📦 Cài từ file .ocx</button>
              <button className="btn btn--ghost" onClick={onOpenClawQuickInstall}>⚙️ Mở / cài OpenClaw CLI</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {allExts.map((ext, i) => {
            const badge = STATE_BADGES[ext.state] || STATE_BADGES.installed;
            const isActioning = actioningId === ext.id;
            const isRuntime = runtimeExts.length > 0;
            const permCount = ext.permissions?.length || 0;
            const grantedCount = ext.grantedPermissions?.length || 0;

            return (
              <div key={ext.id} className="card animate-in" style={{ animationDelay: `${i * 60}ms` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  {/* Icon */}
                  <div className="ext-card__icon" style={{ width: 48, height: 48, fontSize: 24, flexShrink: 0 }}>
                    🧩
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>
                        {ext.displayName || ext.name}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                        v{ext.version}
                      </span>
                      <span className={`sync-badge ${badge.className}`}>
                        {badge.icon} {badge.label}
                      </span>
                    </div>

                    {ext.description && (
                      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 6px' }}>
                        {ext.description}
                      </p>
                    )}

                    <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {ext.author && <span>👤 {ext.author}</span>}
                      {permCount > 0 && (
                        <span
                          style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                          onClick={() => isRuntime && handleShowPermissions(ext as RuntimeExtension)}
                          title="Xem quyền truy cập"
                        >
                          🔐 {grantedCount}/{permCount} quyền
                        </span>
                      )}
                      {ext.state === 'crashed' && (
                        <span style={{ color: 'var(--color-error)' }}>⚠️ Extension bị crash</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {isRuntime && (
                      <>
                        {ext.state === 'running' ? (
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => handleStop(ext.id)}
                            disabled={isActioning}
                          >
                            {isActioning ? '⏳' : '⏹️'} Dừng
                          </button>
                        ) : ext.state !== 'disabled' ? (
                          <button
                            className="btn btn--primary btn--sm"
                            onClick={() => handleStart(ext.id)}
                            disabled={isActioning}
                          >
                            {isActioning ? '⏳' : '▶️'} Chạy
                          </button>
                        ) : null}

                        <button
                          className={`btn btn--sm ${ext.state === 'disabled' ? 'btn--secondary' : 'btn--ghost'}`}
                          onClick={() => handleToggleEnable(ext as RuntimeExtension)}
                          disabled={isActioning}
                          title={ext.state === 'disabled' ? 'Bật lại' : 'Vô hiệu hóa'}
                        >
                          {ext.state === 'disabled' ? '🔓 Bật' : '⏸️'}
                        </button>

                        {permCount > 0 && (
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => handleShowPermissions(ext as RuntimeExtension)}
                            title="Quản lý quyền"
                          >
                            🔐
                          </button>
                        )}
                      </>
                    )}

                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => handleUninstall(ext.id)}
                      disabled={isActioning}
                    >
                      {isActioning ? '⏳' : '🗑️'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Permission Dialog */}
      {permDialogExt && (
        <PermissionDialog
          extensionName={permDialogExt.displayName}
          requestedPermissions={permDialogExt.permissions}
          grantedPermissions={permDialogExt.grantedPermissions}
          definitions={permDefinitions}
          onGrant={handleGrantPermissions}
          onCancel={() => setPermDialogExt(null)}
        />
      )}
    </div>
  );
}
