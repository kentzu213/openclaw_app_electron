import type Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

interface LegacyDiagnosticEvent {
  id?: string;
  timestamp?: string;
  type?: string;
  status?: string;
  detail?: string;
  meta?: unknown;
}

interface LegacyExtension {
  id?: string;
  name?: string;
  displayName?: string;
  display_name?: string;
  version?: string;
  description?: string;
  author?: string;
  iconPath?: string;
  icon_path?: string;
  installPath?: string;
  install_path?: string;
  isEnabled?: boolean;
  is_enabled?: number;
  licenseKey?: string;
  license_key?: string;
  installedAt?: string;
  installed_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

interface LegacyStore {
  settings?: Record<string, unknown> | Array<{ key: string; value: unknown }>;
  diagnosticEvents?: LegacyDiagnosticEvent[];
  diagnostics?: LegacyDiagnosticEvent[];
  installedExtensions?: LegacyExtension[];
  extensions?: LegacyExtension[];
}

function tableHasRows(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as { count: number };
  return row.count > 0;
}

function ensureBackupPath(filePath: string): string {
  const preferred = filePath.replace(/\.json$/i, '.migrated.json.bak');
  if (!fs.existsSync(preferred)) {
    return preferred;
  }

  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(dir, `${base}.${stamp}.migrated.json.bak`);
}

function normalizeSettings(input: LegacyStore['settings']): Array<{ key: string; value: string }> {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input
      .filter((entry) => entry && typeof entry.key === 'string')
      .map((entry) => ({
        key: entry.key,
        value: typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value ?? null),
      }));
  }

  return Object.entries(input).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value ?? null),
  }));
}

function normalizeExtensions(
  input: LegacyExtension[] | undefined,
): Array<Required<Pick<LegacyExtension, 'id' | 'name' | 'version'>> & LegacyExtension> {
  if (!Array.isArray(input)) return [];

  return input
    .filter((entry): entry is LegacyExtension => Boolean(entry?.id && entry?.name && entry?.version))
    .map((entry) => ({
      ...entry,
      id: entry.id!,
      name: entry.name!,
      version: entry.version!,
    }));
}

function normalizeDiagnostics(input: LegacyDiagnosticEvent[] | undefined): LegacyDiagnosticEvent[] {
  return Array.isArray(input) ? input.filter(Boolean) : [];
}

export function runLegacyStoreMigration(db: Database.Database, legacyStorePath: string): void {
  if (!fs.existsSync(legacyStorePath)) {
    return;
  }

  const hasExistingData =
    tableHasRows(db, 'settings') ||
    tableHasRows(db, 'installed_extensions') ||
    tableHasRows(db, 'diagnostic_events');

  if (hasExistingData) {
    return;
  }

  let parsed: LegacyStore | null = null;

  try {
    parsed = JSON.parse(fs.readFileSync(legacyStorePath, 'utf8')) as LegacyStore;
  } catch (error) {
    console.warn('[DB] Failed to parse legacy store, skipping migration:', error);
    return;
  }

  if (!parsed || typeof parsed !== 'object') {
    return;
  }

  const settings = normalizeSettings(parsed.settings);
  const extensions = normalizeExtensions(parsed.installedExtensions ?? parsed.extensions);
  const diagnostics = normalizeDiagnostics(parsed.diagnosticEvents ?? parsed.diagnostics);
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    const upsertSetting = db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    );

    const upsertExtension = db.prepare(
      `INSERT INTO installed_extensions (
         id,
         name,
         display_name,
         version,
         description,
         author,
         icon_path,
         install_path,
         is_enabled,
         license_key,
         installed_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         display_name = excluded.display_name,
         version = excluded.version,
         description = excluded.description,
         author = excluded.author,
         icon_path = excluded.icon_path,
         install_path = excluded.install_path,
         is_enabled = excluded.is_enabled,
         license_key = excluded.license_key,
         updated_at = excluded.updated_at`,
    );

    const insertDiagnostic = db.prepare(
      `INSERT INTO diagnostic_events (id, timestamp, type, status, detail, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    settings.forEach((setting) => {
      upsertSetting.run(setting.key, setting.value, now);
    });

    extensions.forEach((extension) => {
      const installedAt = extension.installedAt ?? extension.installed_at ?? now;
      const updatedAt = extension.updatedAt ?? extension.updated_at ?? installedAt;
      const isEnabled =
        typeof extension.isEnabled === 'boolean'
          ? Number(extension.isEnabled)
          : extension.is_enabled ?? 1;

      upsertExtension.run(
        extension.id,
        extension.name,
        extension.displayName ?? extension.display_name ?? extension.name,
        extension.version,
        extension.description ?? null,
        extension.author ?? null,
        extension.iconPath ?? extension.icon_path ?? null,
        extension.installPath ?? extension.install_path ?? '',
        isEnabled,
        extension.licenseKey ?? extension.license_key ?? null,
        installedAt,
        updatedAt,
      );
    });

    diagnostics.forEach((event, index) => {
      insertDiagnostic.run(
        event.id ?? `legacy-${index}-${Date.now()}`,
        event.timestamp ?? now,
        event.type ?? 'legacy.migration',
        event.status ?? 'info',
        event.detail ?? 'Migrated legacy diagnostic event',
        event.meta === undefined ? null : JSON.stringify(event.meta),
      );
    });
  });

  transaction();

  try {
    const backupPath = ensureBackupPath(legacyStorePath);
    fs.renameSync(legacyStorePath, backupPath);
    console.log(
      `[DB] Migrated legacy JSON store to SQLite (${settings.length} settings, ${extensions.length} extensions, ${diagnostics.length} diagnostics)`,
    );
  } catch (error) {
    console.warn('[DB] Legacy migration completed but backup rename failed:', error);
  }
}
