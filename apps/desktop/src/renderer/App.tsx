import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { MarketplacePage } from './pages/Marketplace';
import { ExtensionsPage } from './pages/Extensions';
import { SettingsPage } from './pages/Settings';

type Page = 'dashboard' | 'marketplace' | 'extensions' | 'settings';

declare global {
  interface Window {
    electronAPI?: any;
  }
}

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      if (window.electronAPI) {
        const authed = await window.electronAPI.auth.isAuthenticated();
        if (authed) {
          const user = await window.electronAPI.auth.getUser();
          setCurrentUser(user);
          setIsAuthenticated(true);
        }
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    }
    setIsLoading(false);
  }

  async function handleLogin(email: string, password: string): Promise<string | null> {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.auth.login({ email, password });
        if (result.success) {
          setCurrentUser(result.user);
          setIsAuthenticated(true);
          return null;
        }
        return result.error || 'Đăng nhập thất bại';
      }
      // Demo mode — simulate Supabase-like response
      setCurrentUser({
        id: 'demo-user',
        name: email.split('@')[0] || 'Demo User',
        email,
        plan: 'Pro',
        balance: 10.50,
        role: 'user',
        activeKeys: 2,
        avatar: email[0]?.toUpperCase() || 'D',
        createdAt: new Date().toISOString(),
      });
      setIsAuthenticated(true);
      return null;
    } catch (err: any) {
      return err.message || 'Đăng nhập thất bại';
    }
  }

  /**
   * Signup handler — creates Supabase account (same project as izziapi.com)
   * User created here is automatically synced with izziapi.com via shared Supabase project.
   * Supabase trigger creates `profiles` row → visible on both platforms.
   */
  async function handleSignup(email: string, password: string, name: string): Promise<string | null> {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.auth.signup({ email, password, name });
        if (result.success) {
          return null; // Success — email verification sent
        }
        return result.error || 'Đăng ký thất bại';
      }
      // Demo mode
      return null;
    } catch (err: any) {
      return err.message || 'Đăng ký thất bại';
    }
  }

  async function handleGoogleLogin(): Promise<string | null> {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.auth.loginWithGoogle();
        if (result.success) {
          return null;
        }
        return result.error || 'Đăng nhập Google thất bại';
      }
      // Demo mode
      window.open('https://izziapi.com/dashboard', '_blank');
      return null;
    } catch (err: any) {
      return err.message || 'Đăng nhập Google thất bại';
    }
  }

  async function handleLogout() {
    try {
      if (window.electronAPI) {
        await window.electronAPI.auth.logout();
      }
    } catch {}
    setCurrentUser(null);
    setIsAuthenticated(false);
    setCurrentPage('dashboard');
  }

  async function handleRefreshProfile() {
    try {
      if (window.electronAPI) {
        const user = await window.electronAPI.auth.refreshProfile();
        if (user) setCurrentUser(user);
      }
    } catch (err) {
      console.error('Profile refresh failed:', err);
    }
  }

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="login-card__logo-icon" style={{ width: 48, height: 48, fontSize: 24 }}>⚡</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <TitleBar />
        <LoginPage
          onLogin={handleLogin}
          onGoogleLogin={handleGoogleLogin}
          onSignup={handleSignup}
        />
      </>
    );
  }

  function renderPage() {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage user={currentUser} onRefresh={handleRefreshProfile} />;
      case 'marketplace': return <MarketplacePage />;
      case 'extensions': return <ExtensionsPage />;
      case 'settings': return <SettingsPage user={currentUser} onLogout={handleLogout} onRefresh={handleRefreshProfile} />;
    }
  }

  return (
    <>
      <TitleBar />
      <div className="app-layout">
        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          user={currentUser}
        />
        <main className="main-content">
          {renderPage()}
        </main>
      </div>
    </>
  );
}
