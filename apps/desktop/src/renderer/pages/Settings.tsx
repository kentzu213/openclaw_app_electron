import React from 'react';

interface SettingsPageProps {
  user: any;
  onLogout: () => void;
  onRefresh?: () => void;
  onOpenClawQuickInstall?: () => void;
  onBuyApi?: () => void;
}

export function SettingsPage({ user, onLogout, onRefresh, onOpenClawQuickInstall, onBuyApi }: SettingsPageProps) {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-header__title">⚙️ Cài đặt</h1>
        <p className="page-header__subtitle">
          Quản lý tài khoản và cấu hình ứng dụng
        </p>
      </div>

      {/* Account */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card__header">
          <h3 className="card__title">👤 Tài khoản</h3>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => window.electronAPI?.shell.openExternal('https://izziapi.com/dashboard/settings')}
          >
            Chỉnh sửa trên IzziAPI →
          </button>
        </div>

        <div className="settings-group">
          <SettingRow label="Tên hiển thị" value={user?.name || 'N/A'} />
          <SettingRow label="Email" value={user?.email || 'N/A'} />
          <SettingRow label="Gói dịch vụ" value={(user?.plan || 'free').charAt(0).toUpperCase() + (user?.plan || 'free').slice(1)} />
          <SettingRow label="Vai trò" value={user?.role === 'admin' ? '🛡️ Admin' : '👤 User'} />
          <SettingRow label="Số dư" value={user?.balance !== undefined ? `$${user.balance.toFixed(2)}` : '$0.00'} />
          <SettingRow label="API Keys" value={`${user?.activeKeys || 0} đang hoạt động`} />
          <SettingRow label="Tham gia từ" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN') : 'N/A'} />
        </div>
      </div>

      {/* Core actions */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card__header">
          <h3 className="card__title">⚡ Tác vụ chính</h3>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn--primary" onClick={onOpenClawQuickInstall}>
            ⚙️ Mở / cài OpenClaw
          </button>
          <button className="btn btn--secondary" onClick={onBuyApi}>
            💳 Mua API trên IzziAPI
          </button>
        </div>
      </div>

      {/* Connection */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card__header">
          <h3 className="card__title">🌐 Kết nối</h3>
        </div>

        <div className="settings-group">
          <div className="settings-item">
            <div>
              <div className="settings-item__label">IzziAPI.com</div>
              <div className="settings-item__description">Kết nối dữ liệu và API</div>
            </div>
            <span className="sync-badge sync-badge--success">✅ Đã kết nối</span>
          </div>

          <div className="settings-item">
            <div>
              <div className="settings-item__label">Đồng bộ tự động</div>
              <div className="settings-item__description">Tự động đồng bộ dữ liệu mỗi 5 phút</div>
            </div>
            <span className="sync-badge sync-badge--success">✅ Bật</span>
          </div>

          <div className="settings-item">
            <div>
              <div className="settings-item__label">Extension Marketplace</div>
              <div className="settings-item__description">Kết nối chợ tiện ích mở rộng</div>
            </div>
            <span className="sync-badge sync-badge--success">✅ Đã kết nối</span>
          </div>
        </div>
      </div>

      {/* App Info */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card__header">
          <h3 className="card__title">ℹ️ Thông tin ứng dụng</h3>
        </div>

        <div className="settings-group">
          <SettingRow label="Phiên bản" value="Starizzi v0.1.0" />
          <SettingRow label="Electron" value="v34.2.0" />
          <SettingRow label="Runtime" value={`Node.js ${typeof process !== 'undefined' ? process.version : 'N/A'}`} />
          <SettingRow label="Platform" value={typeof navigator !== 'undefined' ? navigator.platform : 'N/A'} />
        </div>
      </div>

      {/* Developer */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card__header">
          <h3 className="card__title">🛠️ Dành cho nhà phát triển</h3>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
          Bạn muốn đóng gói và bán tiện ích trên Marketplace? Đăng ký trở thành Developer để bắt đầu kiếm thu nhập.
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className="btn btn--primary"
            onClick={() => window.electronAPI?.shell.openExternal('https://izziapi.com/developer')}
          >
            🚀 Đăng ký Developer
          </button>
          <button
            className="btn btn--secondary"
            onClick={() => window.electronAPI?.shell.openExternal('https://izziapi.com/docs/extensions')}
          >
            📚 Đọc tài liệu SDK
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card" style={{ borderColor: 'rgba(255, 107, 107, 0.2)' }}>
        <div className="card__header">
          <h3 className="card__title" style={{ color: 'var(--color-error)' }}>⚠️ Vùng nguy hiểm</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Đăng xuất</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>
              Ngắt kết nối tài khoản IzziAPI.com khỏi app
            </div>
          </div>
          <button id="btn-logout" className="btn btn--danger" onClick={onLogout}>
            🔓 Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-item">
      <div className="settings-item__label">{label}</div>
      <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>{value}</div>
    </div>
  );
}
