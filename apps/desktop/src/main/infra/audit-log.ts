// ── Audit Log Service ──
// Structured audit logging for security, compliance, and debugging.
// Ported from tuanminhhole/openclaw-setup infra/audit-log.ts

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Types ──

export type AuditCategory =
  | 'auth'          // Login/logout/token refresh
  | 'api'           // API calls to providers
  | 'budget'        // Budget changes, alerts
  | 'config'        // Configuration changes
  | 'security'      // Security events
  | 'system'        // System events (startup, shutdown)
  | 'extension'     // Extension install/uninstall
  | 'error';        // Errors and failures

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AuditEntry {
  id: string;
  timestamp: number;
  category: AuditCategory;
  severity: AuditSeverity;
  action: string;
  details?: Record<string, any>;
  userId?: string;
  deviceId?: string;
  sessionId?: string;
  ipAddress?: string;
}

export interface AuditQuery {
  category?: AuditCategory;
  severity?: AuditSeverity;
  since?: number;
  until?: number;
  limit?: number;
  action?: string;
}

// ── Service ──

export class AuditLogService {
  private dataPath: string;
  private entries: AuditEntry[] = [];
  private maxEntries: number;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private dirty = false;

  constructor(dataDir?: string, maxEntries = 10000) {
    const baseDir = dataDir || path.join(os.homedir(), '.openclaw');
    this.dataPath = path.join(baseDir, 'audit');
    this.maxEntries = maxEntries;
    this.ensureDir();
    this.loadEntries();

    // Flush every 30s
    this.flushInterval = setInterval(() => this.flush(), 30000);
  }

  // ── Log an event ──

  log(
    category: AuditCategory,
    action: string,
    options?: {
      severity?: AuditSeverity;
      details?: Record<string, any>;
      userId?: string;
      deviceId?: string;
      sessionId?: string;
    },
  ): AuditEntry {
    const entry: AuditEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      category,
      severity: options?.severity || 'info',
      action,
      details: options?.details,
      userId: options?.userId,
      deviceId: options?.deviceId,
      sessionId: options?.sessionId,
    };

    this.entries.push(entry);
    this.dirty = true;

    // Trim if over limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Immediate flush for critical events
    if (entry.severity === 'critical') {
      this.flush();
    }

    return entry;
  }

  // ── Convenience methods ──

  info(category: AuditCategory, action: string, details?: Record<string, any>): AuditEntry {
    return this.log(category, action, { severity: 'info', details });
  }

  warn(category: AuditCategory, action: string, details?: Record<string, any>): AuditEntry {
    return this.log(category, action, { severity: 'warning', details });
  }

  error(category: AuditCategory, action: string, details?: Record<string, any>): AuditEntry {
    return this.log(category, action, { severity: 'error', details });
  }

  critical(category: AuditCategory, action: string, details?: Record<string, any>): AuditEntry {
    return this.log(category, action, { severity: 'critical', details });
  }

  // ── Query ──

  query(q: AuditQuery = {}): AuditEntry[] {
    let results = [...this.entries];

    if (q.category) {
      results = results.filter(e => e.category === q.category);
    }
    if (q.severity) {
      results = results.filter(e => e.severity === q.severity);
    }
    if (q.since) {
      results = results.filter(e => e.timestamp >= q.since!);
    }
    if (q.until) {
      results = results.filter(e => e.timestamp <= q.until!);
    }
    if (q.action) {
      results = results.filter(e => e.action.includes(q.action!));
    }

    // Most recent first
    results.sort((a, b) => b.timestamp - a.timestamp);

    if (q.limit) {
      results = results.slice(0, q.limit);
    }

    return results;
  }

  // ── Stats ──

  getStats(): {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    oldest: number | null;
    newest: number | null;
  } {
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const e of this.entries) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
    }

    return {
      total: this.entries.length,
      byCategory,
      bySeverity,
      oldest: this.entries.length > 0 ? this.entries[0].timestamp : null,
      newest: this.entries.length > 0 ? this.entries[this.entries.length - 1].timestamp : null,
    };
  }

  // ── Export ──

  exportJSON(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  exportCSV(): string {
    const header = 'id,timestamp,category,severity,action,details\n';
    const rows = this.entries.map(e =>
      `${e.id},${new Date(e.timestamp).toISOString()},${e.category},${e.severity},"${e.action}","${JSON.stringify(e.details || {}).replace(/"/g, '""')}"`,
    ).join('\n');
    return header + rows;
  }

  // ── Cleanup ──

  purgeOlderThan(days: number): number {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.timestamp >= cutoff);
    const removed = before - this.entries.length;
    if (removed > 0) {
      this.dirty = true;
      this.flush();
    }
    return removed;
  }

  // ── Flush to disk ──

  flush(): void {
    if (!this.dirty) return;
    try {
      fs.writeFileSync(
        path.join(this.dataPath, 'audit-log.json'),
        JSON.stringify(this.entries),
        'utf-8',
      );
      this.dirty = false;
    } catch (err) {
      console.warn('[AuditLog] flush error:', err);
    }
  }

  // ── Shutdown ──

  dispose(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }

  // ── Internal ──

  private ensureDir(): void {
    try { fs.mkdirSync(this.dataPath, { recursive: true }); } catch { /* ignore */ }
  }

  private loadEntries(): void {
    try {
      const logFile = path.join(this.dataPath, 'audit-log.json');
      if (fs.existsSync(logFile)) {
        this.entries = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
      }
    } catch {
      this.entries = [];
    }
  }

  private generateId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `aud_${ts}_${rand}`;
  }
}
