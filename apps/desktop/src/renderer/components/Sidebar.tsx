import React from 'react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: any) => void;
  user: any;
}

const NAV_ITEMS = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'marketplace', icon: '🏪', label: 'Marketplace', badge: 'New' },
  { id: 'extensions', icon: '🧩', label: 'Tiện ích mở rộng' },
];

const SETTINGS_ITEMS = [
  { id: 'settings', icon: '⚙️', label: 'Cài đặt' },
];

export function Sidebar({ currentPage, onNavigate, user }: SidebarProps) {
  const getInitials = (name: string) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <aside className="sidebar">
      <nav className="sidebar__nav">
        <div className="sidebar__section-title">Menu chính</div>
        {NAV_ITEMS.map(item => (
          <div
            key={item.id}
            className={`sidebar__item ${currentPage === item.id ? 'sidebar__item--active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar__item-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.badge && <span className="sidebar__item-badge">{item.badge}</span>}
          </div>
        ))}

        <div className="sidebar__section-title">Hệ thống</div>
        {SETTINGS_ITEMS.map(item => (
          <div
            key={item.id}
            className={`sidebar__item ${currentPage === item.id ? 'sidebar__item--active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar__item-icon">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="sidebar__user">
        <div className="sidebar__user-card" onClick={() => onNavigate('settings')}>
          <div className="sidebar__avatar">
            {user?.avatar ? (
              <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
            ) : (
              getInitials(user?.name || 'User')
            )}
          </div>
          <div className="sidebar__user-info">
            <div className="sidebar__user-name">{user?.name || 'User'}</div>
            <div className="sidebar__user-plan">{user?.plan || 'Free'} Plan</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
