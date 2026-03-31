import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export class DatabaseManager {
  private db!: Database.Database;
  private dbPath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbDir = path.join(userDataPath, 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.dbPath = path.join(dbDir, 'openclaw.db');
  }

  initialize() {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.createTables();
    console.log('[DB] Initialized at:', this.dbPath);
  }

  private createTables() {
    this.db.exec(`
      -- App settings (key-value store)
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Cached user data from izziapi.com
      CREATE TABLE IF NOT EXISTS user_data (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        synced_at TEXT DEFAULT (datetime('now')),
        is_dirty INTEGER DEFAULT 0
      );

      -- Installed extensions
      CREATE TABLE IF NOT EXISTS installed_extensions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT,
        version TEXT NOT NULL,
        description TEXT,
        author TEXT,
        icon_path TEXT,
        install_path TEXT NOT NULL,
        is_enabled INTEGER DEFAULT 1,
        license_key TEXT,
        installed_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Extension settings
      CREATE TABLE IF NOT EXISTS extension_settings (
        extension_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (extension_id, key),
        FOREIGN KEY (extension_id) REFERENCES installed_extensions(id)
      );

      -- Sync log
      CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        status TEXT DEFAULT 'pending',
        error TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  // Settings CRUD
  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value || null;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, value);
  }

  deleteSetting(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }

  // User data cache
  cacheUserData(id: string, type: string, data: object): void {
    this.db.prepare(
      `INSERT INTO user_data (id, type, data, synced_at, is_dirty) VALUES (?, ?, ?, datetime('now'), 0)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, synced_at = excluded.synced_at, is_dirty = 0`
    ).run(id, type, JSON.stringify(data));
  }

  getUserData(type: string): any[] {
    const rows = this.db.prepare('SELECT data FROM user_data WHERE type = ?').all(type) as { data: string }[];
    return rows.map(r => JSON.parse(r.data));
  }

  getDirtyData(): any[] {
    const rows = this.db.prepare('SELECT * FROM user_data WHERE is_dirty = 1').all() as any[];
    return rows.map(r => ({ ...r, data: JSON.parse(r.data) }));
  }

  // Extensions
  getInstalledExtensions(): any[] {
    return this.db.prepare('SELECT * FROM installed_extensions ORDER BY display_name').all();
  }

  addExtension(ext: {
    id: string; name: string; displayName: string; version: string;
    description?: string; author?: string; iconPath?: string;
    installPath: string; licenseKey?: string;
  }): void {
    this.db.prepare(
      `INSERT INTO installed_extensions (id, name, display_name, version, description, author, icon_path, install_path, license_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(ext.id, ext.name, ext.displayName, ext.version, ext.description, ext.author, ext.iconPath, ext.installPath, ext.licenseKey);
  }

  removeExtension(id: string): void {
    this.db.prepare('DELETE FROM extension_settings WHERE extension_id = ?').run(id);
    this.db.prepare('DELETE FROM installed_extensions WHERE id = ?').run(id);
  }

  close() {
    this.db.close();
  }
}
