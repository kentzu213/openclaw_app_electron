import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';

interface MarketplaceExtension {
  id: string;
  name: string;
  displayName: string;
  description: string;
  author: string;
  version: string;
  category: string;
  rating: number;
  installs: number;
  price: { monthly: number; yearly: number } | null;
  icon: string;
}

const CATEGORIES = ['Tất cả', 'SEO', 'Marketing', 'Content', 'Analytics', 'Email', 'Customer Support'];

// Demo fallback data
const DEMO_EXTENSIONS: MarketplaceExtension[] = [
  { id: 'ext-seo-scanner', name: 'smart-seo-scanner', displayName: 'Smart SEO Scanner', description: 'Quét và phân tích SEO tự động cho website. Tìm lỗi meta tags, broken links, và tối ưu on-page.', author: 'SEO Tools Inc.', version: '1.2.0', category: 'SEO', rating: 4.8, installs: 12500, price: null, icon: '🔍' },
  { id: 'ext-social-auto', name: 'social-auto-poster', displayName: 'Social Auto Poster', description: 'Tự động đăng bài lên Facebook, Instagram, Twitter. Lên lịch và quản lý nội dung đa nền tảng.', author: 'MarketBot Team', version: '2.0.1', category: 'Marketing', rating: 4.5, installs: 8900, price: { monthly: 9.99, yearly: 99.99 }, icon: '📱' },
  { id: 'ext-ai-content', name: 'ai-content-writer', displayName: 'AI Content Writer', description: 'Viết nội dung marketing, blog, email bằng AI. Hỗ trợ tiếng Việt và 30+ ngôn ngữ.', author: 'ContentAI Co.', version: '3.1.0', category: 'Content', rating: 4.9, installs: 25000, price: { monthly: 19.99, yearly: 199.99 }, icon: '✨' },
  { id: 'ext-analytics', name: 'deep-analytics', displayName: 'Deep Analytics Dashboard', description: 'Dashboard phân tích traffic, conversion, user behavior. Tích hợp Google Analytics và Facebook Pixel.', author: 'DataViz Studio', version: '1.5.0', category: 'Analytics', rating: 4.7, installs: 15200, price: null, icon: '📊' },
  { id: 'ext-email-campaign', name: 'email-campaign-pro', displayName: 'Email Campaign Pro', description: 'Tạo và gửi email marketing chuyên nghiệp. A/B testing, automation workflows, và analytics.', author: 'MailFlow Solutions', version: '2.3.0', category: 'Email', rating: 4.6, installs: 6700, price: { monthly: 14.99, yearly: 149.99 }, icon: '📧' },
  { id: 'ext-chatbot', name: 'smart-chatbot', displayName: 'Smart Chatbot Builder', description: 'Xây dựng chatbot AI cho website và Messenger. Tự động trả lời khách hàng 24/7.', author: 'BotFactory', version: '1.0.0', category: 'Customer Support', rating: 4.4, installs: 3200, price: { monthly: 24.99, yearly: 249.99 }, icon: '🤖' },
];

export function MarketplacePage() {
  const [extensions, setExtensions] = useState<MarketplaceExtension[]>([]);
  const [filteredExtensions, setFilteredExtensions] = useState<MarketplaceExtension[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 12;

  useEffect(() => {
    checkApiAndLoad();
    loadInstalled();
  }, []);

  useEffect(() => {
    filterExtensions();
  }, [extensions, searchQuery, activeCategory]);

  async function checkApiAndLoad() {
    setIsLoading(true);
    setError(null);

    // Try marketplace API (port 8788) first
    const isApiOnline = await apiClient.checkMarketplaceHealth();
    setApiStatus(isApiOnline ? 'online' : 'offline');

    if (isApiOnline) {
      await loadFromApi();
    } else if (window.electronAPI) {
      await loadFromElectron();
    } else {
      // Browser dev mode — no API available, use demo data
      console.log('[Marketplace] Using demo data (API offline, no Electron)');
      setExtensions(DEMO_EXTENSIONS);
    }

    setIsLoading(false);
  }

  async function loadFromApi(page = 1) {
    try {
      const data = await apiClient.getMarketplaceExtensions({
        search: searchQuery || undefined,
        category: activeCategory !== 'Tất cả' ? activeCategory : undefined,
        page,
        limit: PAGE_SIZE,
        sort: 'popular',
      });

      // Normalize API response to our interface
      const mapped: MarketplaceExtension[] = (data.extensions || data || []).map((e: any) => ({
        id: e.id,
        name: e.name,
        displayName: e.display_name || e.displayName,
        description: e.description,
        author: e.author || e.developer_name || 'Unknown',
        version: e.version,
        category: e.category,
        rating: e.rating_avg || e.rating || 0,
        installs: e.install_count || e.installs || 0,
        price: e.price_monthly
          ? { monthly: e.price_monthly, yearly: e.price_yearly || e.price_monthly * 10 }
          : null,
        icon: e.icon_url || e.icon || '🧩',
      }));

      setExtensions(mapped);
      setTotalPages(data.pagination?.totalPages || data.totalPages || Math.ceil((data.pagination?.total || data.total || mapped.length) / PAGE_SIZE));
      setCurrentPage(data.pagination?.page || page);
      console.log(`[Marketplace] Loaded ${mapped.length} extensions from API (page ${page})`);
    } catch (err: any) {
      console.error('[Marketplace] API fetch failed:', err);
      setError(`API Error: ${err.message}`);
      // Fall back to demo
      setExtensions(DEMO_EXTENSIONS);
    }
  }

  async function loadFromElectron() {
    try {
      const data = await window.electronAPI!.extensions.marketplace(searchQuery || undefined);
      setExtensions(data || []);
      console.log(`[Marketplace] Loaded ${data?.length || 0} extensions from Electron IPC`);
    } catch (err: any) {
      console.warn('[Marketplace] Electron IPC failed:', err);
      setExtensions(DEMO_EXTENSIONS);
    }
  }

  async function loadInstalled() {
    try {
      if (window.electronAPI) {
        const installed = await window.electronAPI.extensions.list();
        setInstalledIds(new Set(installed.map((e: any) => e.id)));
      }
    } catch {}
  }

  const filterExtensions = useCallback(() => {
    let filtered = [...extensions];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        e => e.displayName.toLowerCase().includes(q) ||
             e.description.toLowerCase().includes(q) ||
             e.author.toLowerCase().includes(q)
      );
    }
    if (activeCategory !== 'Tất cả') {
      filtered = filtered.filter(e => e.category === activeCategory);
    }
    setFilteredExtensions(filtered);
  }, [extensions, searchQuery, activeCategory]);

  // Debounced API search
  useEffect(() => {
    if (apiStatus !== 'online') return;
    const timer = setTimeout(() => {
      loadFromApi(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, activeCategory]);

  async function handleInstall(ext: MarketplaceExtension) {
    setInstallingId(ext.id);
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.extensions.install(ext.id);
        if (result.success) {
          setInstalledIds(prev => new Set([...prev, ext.id]));
        }
      } else if (apiStatus === 'online') {
        await apiClient.installExtension(ext.id);
        setInstalledIds(prev => new Set([...prev, ext.id]));
      } else {
        // Demo mode
        await new Promise(r => setTimeout(r, 1500));
        setInstalledIds(prev => new Set([...prev, ext.id]));
      }
    } catch (err) {
      console.error('Install failed:', err);
    }
    setInstallingId(null);
  }

  function formatInstalls(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
  }

  function renderStars(rating: number): string {
    const full = Math.floor(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  function handlePageChange(page: number) {
    if (apiStatus === 'online') {
      loadFromApi(page);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-header__title">🏪 Marketplace</h1>
        <p className="page-header__subtitle">
          Khám phá và cài đặt tiện ích mở rộng cho Starizzi
        </p>
      </div>

      {/* API Status Badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px',
        fontSize: '12px',
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: apiStatus === 'online' ? '#00b894' : apiStatus === 'offline' ? '#ff6b6b' : '#fdcb6e',
          display: 'inline-block',
        }} />
        <span style={{ color: 'var(--color-text-tertiary)' }}>
          {apiStatus === 'online' && 'Marketplace API kết nối'}
          {apiStatus === 'offline' && 'Marketplace API offline — hiển thị dữ liệu demo'}
          {apiStatus === 'checking' && 'Đang kiểm tra kết nối...'}
        </span>
        {apiStatus === 'offline' && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={checkApiAndLoad}
            style={{ padding: '2px 8px', fontSize: '11px' }}
          >
            🔄 Thử lại
          </button>
        )}
      </div>

      {error && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          background: 'rgba(255, 107, 107, 0.1)',
          border: '1px solid rgba(255, 107, 107, 0.2)',
          color: '#ff6b6b',
          fontSize: '13px',
          marginBottom: '16px',
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Search */}
      <div className="search-bar">
        <span className="search-bar__icon">🔍</span>
        <input
          id="marketplace-search"
          className="search-bar__input"
          type="text"
          placeholder="Tìm kiếm tiện ích... (VD: SEO, chatbot, email)"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Category Filter */}
      <div className="filter-pills">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`filter-pill ${activeCategory === cat ? 'filter-pill--active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 0',
          gap: '12px',
        }}>
          <div style={{
            width: 40,
            height: 40,
            border: '3px solid var(--color-bg-hover)',
            borderTopColor: 'var(--color-accent-primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
            Đang tải marketplace...
          </span>
        </div>
      ) : (
        <>
          {/* Extension Grid */}
          <div className="section-header">
            <h2 className="section-header__title">
              {activeCategory === 'Tất cả' ? 'Tất cả tiện ích' : activeCategory}
            </h2>
            <span style={{ fontSize: '14px', color: 'var(--color-text-tertiary)' }}>
              {filteredExtensions.length} kết quả
            </span>
          </div>

          <div className="marketplace-grid">
            {filteredExtensions.map((ext, i) => {
              const isInstalled = installedIds.has(ext.id);
              const isInstalling = installingId === ext.id;

              return (
                <div key={ext.id} className="ext-card animate-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="ext-card__header">
                    <div className="ext-card__icon">{ext.icon}</div>
                    <div className="ext-card__meta">
                      <div className="ext-card__name">{ext.displayName}</div>
                      <div className="ext-card__author">by {ext.author}</div>
                    </div>
                    <span className="ext-card__category">{ext.category}</span>
                  </div>

                  <p className="ext-card__description">{ext.description}</p>

                  <div className="ext-card__footer">
                    <div className="ext-card__stats">
                      <span className="ext-card__rating">
                        {renderStars(ext.rating)} {ext.rating.toFixed(1)}
                      </span>
                      <span className="ext-card__installs">
                        📥 {formatInstalls(ext.installs)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {ext.price ? (
                        <span className="ext-card__price ext-card__price--paid">
                          ${ext.price.monthly}/mo
                        </span>
                      ) : (
                        <span className="ext-card__price ext-card__price--free">Miễn phí</span>
                      )}

                      {isInstalled ? (
                        <button className="btn btn--installed btn--sm">✓ Đã cài</button>
                      ) : (
                        <button
                          className="btn btn--primary btn--sm"
                          onClick={() => handleInstall(ext)}
                          disabled={isInstalling}
                        >
                          {isInstalling ? '⏳' : '📦'} {isInstalling ? 'Đang cài...' : 'Cài đặt'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
              marginTop: '24px',
              padding: '16px 0',
            }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                ← Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  className={`btn btn--sm ${page === currentPage ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => handlePageChange(page)}
                  style={{ minWidth: 36 }}
                >
                  {page}
                </button>
              ))}
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Tiếp →
              </button>
            </div>
          )}

          {filteredExtensions.length === 0 && !isLoading && (
            <div className="empty-state">
              <div className="empty-state__icon">🔍</div>
              <h3 className="empty-state__title">Không tìm thấy tiện ích</h3>
              <p className="empty-state__description">
                Thử thay đổi từ khóa tìm kiếm hoặc chọn danh mục khác
              </p>
            </div>
          )}
        </>
      )}

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
