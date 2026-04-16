/**
 * AuthManager — Supabase Auth Integration
 * Tích hợp cùng hệ thống auth với izziapi.com
 * - Supabase signInWithPassword / signInWithOAuth
 * - User profile from Supabase auth.getUser()
 * - Local OpenClaw config (~/.openclaw/openclaw.json) for API key/plan
 * - Token storage via electron safeStorage
 */

import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { safeStorage, shell, BrowserWindow } from 'electron';
import { DatabaseManager } from '../db/database';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// IzziAPI.com Backend URL
const IZZI_API_BASE = process.env.OPENCLAW_API_URL || 'https://api.izziapi.com';

// Supabase config — same project as izziapi.com
// Anon key is public (RLS-protected) — same approach as izzi-web frontend
const SUPABASE_URL = process.env.OPENCLAW_SUPABASE_URL || 'https://qdtfaebdgyyujygxnvqi.supabase.co';
const SUPABASE_ANON_KEY = process.env.OPENCLAW_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdGZhZWJkZ3l5dWp5Z3hudnFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1Mjk2NjYsImV4cCI6MjA5MDEwNTY2Nn0.tVQKuDcX3WFSNTPxiZU4aenv4OVsJ9bMouxYPiYkUck';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  apiKey?: string;
  plan?: string;
  balance?: number;
  role?: string;
  activeKeys?: number;
  createdAt?: string;
}

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}

interface DemoRegisteredUser {
  id: string;
  email: string;
  password: string;
  name: string;
  createdAt: string;
}

export class AuthManager {
  private session: StoredSession | null = null;
  private supabase: SupabaseClient | null = null;
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
    this.initSupabase();
    this.loadSession();
  }

  private initSupabase() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: true,
          persistSession: false, // We handle persistence ourselves via safeStorage
          flowType: 'implicit',  // MUST use implicit flow for Electron desktop
          // PKCE flow fails because code_verifier is generated in Node.js
          // but OAuth happens in a BrowserWindow with a different context
        },
      });
      console.log('[Auth] Supabase client initialized (implicit flow)');
    } else {
      console.warn('[Auth] Supabase credentials not configured — running in demo mode');
    }
  }

  private loadSession() {
    try {
      const stored = this.db.getSetting('auth_session');
      if (stored) {
        const decrypted = safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(Buffer.from(stored, 'base64'))
          : stored;
        this.session = JSON.parse(decrypted);

        // If Supabase is now configured but session is a demo token,
        // clear it to force real authentication
        if (this.supabase && this.session?.accessToken?.startsWith('demo-token-')) {
          console.log('[Auth] Clearing stale demo session — Supabase is now configured, requiring real login');
          this.clearSession();
          return;
        }

        // Check if session is expired
        if (this.session && this.session.expiresAt < Date.now()) {
          console.log('[Auth] Stored session expired, will refresh');
          this.refreshAccessToken();
        }
      }
    } catch (err) {
      console.error('[Auth] Failed to load session:', err);
      this.session = null;
    }
  }

  private saveSession(session: StoredSession) {
    this.session = session;
    try {
      const serialized = JSON.stringify(session);
      const encrypted = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(serialized).toString('base64')
        : serialized;
      this.db.setSetting('auth_session', encrypted);
    } catch (err) {
      console.error('[Auth] Failed to save session:', err);
    }
  }

  private clearSession() {
    this.session = null;
    this.db.deleteSetting('auth_session');
  }

  private getDemoUsers(): DemoRegisteredUser[] {
    try {
      const raw = this.db.getSetting('demo_users');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveDemoUsers(users: DemoRegisteredUser[]) {
    this.db.setSetting('demo_users', JSON.stringify(users));
  }

  /**
   * Fetch user profile from Supabase auth + local OpenClaw config.
   * Previously called /api/auth/me which doesn't exist on izziapi.com.
   * Now uses Supabase getUser() for identity and reads ~/.openclaw/openclaw.json
   * for API key and plan info (set by izzi-openclaw installer).
   */
  private async fetchProfile(accessToken: string): Promise<User | null> {
    try {
      if (!this.supabase) return null;

      // Get user identity from Supabase
      const { data: { user: supaUser }, error } = await this.supabase.auth.getUser(accessToken);
      if (error || !supaUser) {
        console.warn('[Auth] Supabase getUser failed:', error?.message);
        return null;
      }

      // Read local OpenClaw config for API key/plan info
      const localConfig = this.readLocalOpenClawConfig();

      return {
        id: supaUser.id,
        email: supaUser.email || '',
        name: supaUser.user_metadata?.full_name || supaUser.user_metadata?.name || supaUser.email?.split('@')[0] || '',
        avatar: (supaUser.user_metadata?.full_name || supaUser.email || 'U')[0].toUpperCase(),
        apiKey: localConfig?.apiKey,
        plan: localConfig?.plan ?? 'free',
        balance: 0,
        role: 'user',
        activeKeys: localConfig?.apiKey ? 1 : 0,
        createdAt: supaUser.created_at || new Date().toISOString(),
      };
    } catch (err) {
      console.error('[Auth] Failed to fetch profile:', err);
      return null;
    }
  }

  /**
   * Read local ~/.openclaw/openclaw.json config (set by izzi-openclaw installer).
   * Returns API key, baseUrl, and models info.
   */
  private readLocalOpenClawConfig(): { apiKey?: string; baseUrl?: string; plan?: string; models?: string[] } | null {
    try {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      if (!fs.existsSync(configPath)) return null;
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      return {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        plan: config.apiKey ? 'pro' : 'free',
        models: config.models || [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Expose Supabase client for direct queries (used by SyncEngine).
   */
  getSupabaseClient(): SupabaseClient | null {
    return this.supabase;
  }

  /**
   * Login with email + password via Supabase Auth
   * Same flow as izzi-web-v2/src/context/AuthContext.tsx login()
   */
  async login(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    // Demo mode fallback — still requires prior signup
    if (!this.supabase) {
      const registered = this.getDemoUsers().find(
        (user) => user.email.toLowerCase() === email.toLowerCase(),
      );

      if (!registered) {
        return { success: false, error: 'Tài khoản chưa tồn tại. Vui lòng đăng ký trước để sử dụng desktop app.' };
      }

      if (registered.password !== password) {
        return { success: false, error: 'Sai mật khẩu.' };
      }

      const demoUser: User = {
        id: registered.id,
        email: registered.email,
        name: registered.name,
        avatar: registered.name[0]?.toUpperCase() || registered.email[0]?.toUpperCase() || 'U',
        plan: 'trial',
        balance: 0,
        role: 'user',
        activeKeys: 0,
        createdAt: registered.createdAt,
      };
      this.saveSession({
        accessToken: `demo-token-${registered.id}`,
        refreshToken: `demo-refresh-${registered.id}`,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        user: demoUser,
      });
      this.db.appendDiagnosticEvent({ type: 'auth.login', status: 'success', detail: `Demo login: ${email}` });
      console.log('[Auth] Demo login:', email);
      return { success: true, user: demoUser };
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });

      if (error) {
        console.error('[Auth] Supabase login error:', error.message);
        this.db.appendDiagnosticEvent({ type: 'auth.login', status: 'error', detail: error.message, meta: { email } });

        // Translate common Supabase errors to helpful Vietnamese messages
        let userMessage = error.message;
        if (error.message === 'Invalid login credentials') {
          userMessage = 'Email hoặc mật khẩu không đúng. Nếu chưa có tài khoản, vui lòng bấm "Đăng ký miễn phí" hoặc "Đăng nhập với Google".';
        } else if (error.message.includes('Email not confirmed')) {
          userMessage = 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư để xác nhận tài khoản.';
        } else if (error.message.includes('Too many requests')) {
          userMessage = 'Quá nhiều lần thử. Vui lòng đợi vài phút rồi thử lại.';
        }

        return { success: false, error: userMessage };
      }

      if (!data.session) {
        return { success: false, error: 'No session returned' };
      }

      // Fetch full profile from izzi-backend
      const profile = await this.fetchProfile(data.session.access_token);
      const user: User = profile || {
        id: data.user.id,
        email: data.user.email || email,
        name: data.user.user_metadata?.name || email.split('@')[0],
        plan: 'free',
      };

      this.saveSession({
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: (data.session.expires_at || 0) * 1000,
        user,
      });

      this.db.appendDiagnosticEvent({ type: 'auth.login', status: 'success', detail: `Supabase login: ${user.email}` });
      console.log('[Auth] Login successful:', user.email);
      return { success: true, user };
    } catch (err: any) {
      const message = err.message || 'Login failed';
      console.error('[Auth] Login error:', message);
      this.db.appendDiagnosticEvent({ type: 'auth.login', status: 'error', detail: message, meta: { email } });
      return { success: false, error: message };
    }
  }

  /**
   * Login with Google OAuth via Supabase (Implicit Flow)
   * Opens a BrowserWindow popup for the OAuth flow
   */
  async loginWithGoogle(): Promise<{ success: boolean; user?: User; error?: string }> {
    if (!this.supabase) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      // For implicit flow in Electron:
      // - redirect to a localhost URL that the BrowserWindow can intercept
      // - Supabase will append tokens as hash fragment: #access_token=...&refresh_token=...
      // - The BrowserWindow's will-navigate/did-navigate events capture these before the page loads
      const redirectUrl = 'http://localhost/auth/callback';

      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.url) {
        return { success: false, error: 'No OAuth URL returned' };
      }

      console.log('[Auth] Opening Google OAuth popup (implicit flow)');
      // Open OAuth in a BrowserWindow popup (much more reliable than custom protocol)
      return await this.openOAuthPopup(data.url);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Open OAuth flow in a BrowserWindow and intercept the callback
   * This is the standard Electron approach — much more reliable than custom:// protocols
   */
  private openOAuthPopup(authUrl: string): Promise<{ success: boolean; user?: User; error?: string }> {
    return new Promise((resolve) => {
      const popup = new BrowserWindow({
        width: 500,
        height: 700,
        show: true,
        autoHideMenuBar: true,
        title: 'Đăng nhập với Google',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      let resolved = false;
      const finish = (result: { success: boolean; user?: User; error?: string }) => {
        if (resolved) return;
        resolved = true;
        try { popup.close(); } catch { /* already closed */ }
        resolve(result);
      };

      // Intercept navigation to detect the callback URL with tokens
      popup.webContents.on('will-redirect', async (_event, url) => {
        console.log('[Auth] OAuth redirect URL:', url);
        await this.tryExtractOAuthTokens(url, finish);
      });

      popup.webContents.on('will-navigate', async (_event, url) => {
        console.log('[Auth] OAuth navigate URL:', url);
        await this.tryExtractOAuthTokens(url, finish);
      });

      // Also handle page title changes (some OAuth flows land on a page with tokens in the URL)
      popup.webContents.on('did-navigate', async (_event, url) => {
        console.log('[Auth] OAuth did-navigate URL:', url);
        await this.tryExtractOAuthTokens(url, finish);
      });

      popup.on('closed', () => {
        finish({ success: false, error: 'Cửa sổ đăng nhập đã bị đóng' });
      });

      popup.loadURL(authUrl);
    });
  }

  /**
   * Try to extract OAuth tokens from a URL (hash fragment — implicit flow)
   * With flowType: 'implicit', Supabase returns tokens directly in the URL hash
   */
  private async tryExtractOAuthTokens(
    url: string,
    finish: (result: { success: boolean; user?: User; error?: string }) => void,
  ) {
    try {
      const parsed = new URL(url);

      // Implicit flow: Supabase puts tokens in hash fragment: #access_token=...&refresh_token=...
      let accessToken: string | null = null;
      let refreshToken: string | null = null;

      // Check hash fragment (standard for implicit flow)
      if (parsed.hash && parsed.hash.length > 1) {
        const hashParams = new URLSearchParams(parsed.hash.substring(1));
        accessToken = hashParams.get('access_token');
        refreshToken = hashParams.get('refresh_token');

        // Check for error in hash (e.g., #error=access_denied)
        const hashError = hashParams.get('error_description') || hashParams.get('error');
        if (hashError) {
          console.error('[Auth] OAuth error in hash:', hashError);
          finish({ success: false, error: hashError });
          return;
        }
      }

      // Fallback: check query params
      if (!accessToken) {
        accessToken = parsed.searchParams.get('access_token');
        refreshToken = parsed.searchParams.get('refresh_token');
      }

      if (accessToken && refreshToken) {
        console.log('[Auth] Got OAuth tokens from URL (implicit flow)');
        const result = await this.setSessionFromTokens(accessToken, refreshToken);
        finish(result);
      }
      // If no tokens found, let navigation continue (user is still in OAuth flow)
    } catch {
      // URL parse errors are expected for non-callback URLs — ignore them
    }
  }

  /**
   * Set session from access_token + refresh_token (from OAuth hash fragment)
   */
  private async setSessionFromTokens(accessToken: string, refreshToken: string): Promise<{ success: boolean; user?: User; error?: string }> {
    if (!this.supabase) return { success: false, error: 'Supabase not configured' };

    try {
      const { data, error } = await this.supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error || !data.session) {
        return { success: false, error: error?.message || 'Failed to set session' };
      }

      const profile = await this.fetchProfile(data.session.access_token);
      const user: User = profile || {
        id: data.user?.id || '',
        email: data.user?.email || '',
        name: data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || data.user?.email?.split('@')[0] || '',
        plan: 'free',
      };

      this.saveSession({
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: (data.session.expires_at || 0) * 1000,
        user,
      });

      this.db.appendDiagnosticEvent({ type: 'auth.login', status: 'success', detail: `Google OAuth: ${user.email}` });
      console.log('[Auth] Google OAuth login successful:', user.email);
      return { success: true, user };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Handle OAuth callback (legacy — kept for custom protocol handler compatibility)
   * With implicit flow, only hash fragment tokens are expected
   */
  async handleOAuthCallback(url: string): Promise<{ success: boolean; user?: User; error?: string }> {
    if (!this.supabase) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const parsed = new URL(url);

      // Check hash fragment first (implicit flow)
      let accessToken: string | null = null;
      let refreshToken: string | null = null;

      if (parsed.hash && parsed.hash.length > 1) {
        const hashParams = new URLSearchParams(parsed.hash.substring(1));
        accessToken = hashParams.get('access_token');
        refreshToken = hashParams.get('refresh_token');
      }

      // Fallback: query params
      if (!accessToken) {
        accessToken = parsed.searchParams.get('access_token');
        refreshToken = parsed.searchParams.get('refresh_token');
      }

      if (accessToken && refreshToken) {
        return await this.setSessionFromTokens(accessToken, refreshToken);
      }

      return { success: false, error: 'Không tìm thấy thông tin đăng nhập trong URL' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Signup new user via Supabase Auth
   * After successful signup, auto-login the user
   */
  async signup(email: string, password: string, name: string): Promise<{ success: boolean; needsConfirmation?: boolean; error?: string }> {
    if (!this.supabase) {
      const users = this.getDemoUsers();
      const exists = users.some((user) => user.email.toLowerCase() === email.toLowerCase());

      if (exists) {
        return { success: false, error: 'Email đã được đăng ký trong bản chạy thử.' };
      }

      users.push({
        id: `demo-${Date.now()}`,
        email,
        password,
        name,
        createdAt: new Date().toISOString(),
      });
      this.saveDemoUsers(users);
      this.db.appendDiagnosticEvent({ type: 'auth.signup', status: 'success', detail: `Demo signup: ${email}` });
      return { success: true };
    }

    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: { data: { name, full_name: name } },
      });

      if (error) {
        this.db.appendDiagnosticEvent({ type: 'auth.signup', status: 'error', detail: error.message, meta: { email } });

        // Translate common errors
        let msg = error.message;
        if (error.message.includes('already registered') || error.message.includes('already been registered')) {
          msg = 'Email đã được đăng ký. Vui lòng dùng "Đăng nhập" hoặc "Đăng nhập với Google".';
        } else if (error.message.includes('password')) {
          msg = 'Mật khẩu phải có ít nhất 6 ký tự.';
        }

        return { success: false, error: msg };
      }

      this.db.appendDiagnosticEvent({ type: 'auth.signup', status: 'success', detail: `Supabase signup: ${email}` });

      // If Supabase returned a session (email confirmation disabled), auto-login
      if (data.session) {
        const profile = await this.fetchProfile(data.session.access_token);
        const user: User = profile || {
          id: data.user?.id || '',
          email: data.user?.email || email,
          name: data.user?.user_metadata?.name || name,
          plan: 'free',
        };

        this.saveSession({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: (data.session.expires_at || 0) * 1000,
          user,
        });

        console.log('[Auth] Signup + auto-login successful:', email);
        return { success: true };
      }

      // If no session, user needs to confirm email first
      console.log('[Auth] Signup successful, awaiting email confirmation:', email);
      return { success: true, needsConfirmation: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.supabase) {
        await this.supabase.auth.signOut();
      }
    } catch {
      // Ignore logout API errors
    }
    this.clearSession();
    this.db.appendDiagnosticEvent({ type: 'auth.logout', status: 'info', detail: 'User logged out' });
    console.log('[Auth] Logged out');
  }

  async refreshAccessToken(): Promise<boolean> {
    if (!this.session?.refreshToken || !this.supabase) return false;

    try {
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: this.session.refreshToken,
      });

      if (error || !data.session) {
        console.error('[Auth] Token refresh failed:', error?.message);
        this.clearSession();
        return false;
      }

      // Refresh profile data
      const profile = await this.fetchProfile(data.session.access_token);
      const user = profile || this.session.user;

      this.saveSession({
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: (data.session.expires_at || 0) * 1000,
        user,
      });

      return true;
    } catch {
      console.error('[Auth] Token refresh error');
      return false;
    }
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.session) return null;

    // Refresh 5 minutes before expiry
    if (this.session.expiresAt - Date.now() < 5 * 60 * 1000) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) return null;
    }

    return this.session.accessToken;
  }

  isAuthenticated(): boolean {
    return this.session !== null;
  }

  getCurrentUser(): User | null {
    return this.session?.user || null;
  }

  getApiKey(): string | null {
    return this.session?.user?.apiKey || null;
  }

  /**
   * Refresh user profile from backend (e.g., after balance change)
   */
  async refreshProfile(): Promise<User | null> {
    const token = await this.getAccessToken();
    if (!token) return null;

    const profile = await this.fetchProfile(token);
    if (profile && this.session) {
      this.session.user = profile;
      this.saveSession(this.session);
    }
    return profile;
  }
}
