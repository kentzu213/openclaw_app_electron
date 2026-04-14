// ── Agent Memory System ──
// Persistent memory store for cross-session context.
// Ported from tuanminhhole/openclaw-setup infra/memory-system.ts

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Types ──

export interface MemoryItem {
  id: string;
  key: string;
  value: any;
  category: 'preference' | 'context' | 'fact' | 'skill' | 'conversation';
  importance: number;      // 0-10 scale
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt: number;
  source?: string;         // Which agent/process created it
  tags?: string[];
}

export interface MemorySearchOptions {
  category?: MemoryItem['category'];
  tags?: string[];
  minImportance?: number;
  limit?: number;
  query?: string;          // Full-text search on key+value
}

// ── Service ──

export class MemorySystem {
  private dataPath: string;
  private items: Map<string, MemoryItem> = new Map();
  private maxItems: number;
  private dirty = false;

  constructor(dataDir?: string, maxItems = 5000) {
    const baseDir = dataDir || path.join(os.homedir(), '.openclaw');
    this.dataPath = path.join(baseDir, 'memory');
    this.maxItems = maxItems;
    this.ensureDir();
    this.loadData();
  }

  // ── Store ──

  set(
    key: string,
    value: any,
    options?: {
      category?: MemoryItem['category'];
      importance?: number;
      pinned?: boolean;
      source?: string;
      tags?: string[];
    },
  ): MemoryItem {
    const existing = this.items.get(key);
    const now = Date.now();

    if (existing) {
      existing.value = value;
      existing.updatedAt = now;
      existing.accessCount++;
      existing.lastAccessedAt = now;
      if (options?.importance !== undefined) existing.importance = options.importance;
      if (options?.pinned !== undefined) existing.pinned = options.pinned;
      if (options?.tags) existing.tags = options.tags;
      this.dirty = true;
      return existing;
    }

    const item: MemoryItem = {
      id: this.generateId(),
      key,
      value,
      category: options?.category || 'context',
      importance: options?.importance ?? 5,
      pinned: options?.pinned ?? false,
      createdAt: now,
      updatedAt: now,
      accessCount: 1,
      lastAccessedAt: now,
      source: options?.source,
      tags: options?.tags,
    };

    this.items.set(key, item);
    this.dirty = true;

    // Eviction if over limit
    if (this.items.size > this.maxItems) {
      this.evict();
    }

    return item;
  }

  // ── Retrieve ──

  get(key: string): any | undefined {
    const item = this.items.get(key);
    if (!item) return undefined;
    item.accessCount++;
    item.lastAccessedAt = Date.now();
    this.dirty = true;
    return item.value;
  }

  getItem(key: string): MemoryItem | undefined {
    return this.items.get(key);
  }

  // ── Delete ──

  delete(key: string): boolean {
    const deleted = this.items.delete(key);
    if (deleted) this.dirty = true;
    return deleted;
  }

  // ── Search ──

  search(options: MemorySearchOptions = {}): MemoryItem[] {
    let results = Array.from(this.items.values());

    if (options.category) {
      results = results.filter(i => i.category === options.category);
    }
    if (options.minImportance !== undefined) {
      results = results.filter(i => i.importance >= options.minImportance!);
    }
    if (options.tags?.length) {
      results = results.filter(i =>
        i.tags?.some(t => options.tags!.includes(t)),
      );
    }
    if (options.query) {
      const q = options.query.toLowerCase();
      results = results.filter(i =>
        i.key.toLowerCase().includes(q) ||
        JSON.stringify(i.value).toLowerCase().includes(q),
      );
    }

    // Sort by importance (desc), then recency
    results.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return b.lastAccessedAt - a.lastAccessedAt;
    });

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // ── List all ──

  listAll(): MemoryItem[] {
    return Array.from(this.items.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ── Pin/Unpin ──

  pin(key: string): boolean {
    const item = this.items.get(key);
    if (!item) return false;
    item.pinned = true;
    this.dirty = true;
    return true;
  }

  unpin(key: string): boolean {
    const item = this.items.get(key);
    if (!item) return false;
    item.pinned = false;
    this.dirty = true;
    return true;
  }

  // ── Stats ──

  getStats(): {
    total: number;
    pinned: number;
    byCategory: Record<string, number>;
    avgImportance: number;
  } {
    const all = Array.from(this.items.values());
    const byCategory: Record<string, number> = {};
    let totalImportance = 0;

    for (const item of all) {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
      totalImportance += item.importance;
    }

    return {
      total: all.length,
      pinned: all.filter(i => i.pinned).length,
      byCategory,
      avgImportance: all.length > 0 ? totalImportance / all.length : 0,
    };
  }

  // ── Context window builder (for AI prompts) ──

  buildContext(maxItems = 20): string {
    const relevant = this.search({ minImportance: 3, limit: maxItems });
    if (relevant.length === 0) return '';

    const lines = relevant.map(item => {
      const prefix = item.pinned ? '📌 ' : '';
      return `${prefix}[${item.category}] ${item.key}: ${JSON.stringify(item.value)}`;
    });

    return `=== Agent Memory (${relevant.length} items) ===\n${lines.join('\n')}`;
  }

  // ── Persistence ──

  save(): void {
    if (!this.dirty) return;
    try {
      const data = Array.from(this.items.entries());
      fs.writeFileSync(
        path.join(this.dataPath, 'memory.json'),
        JSON.stringify(data),
        'utf-8',
      );
      this.dirty = false;
    } catch (err) {
      console.warn('[MemorySystem] save error:', err);
    }
  }

  dispose(): void {
    this.save();
  }

  // ── Internal ──

  private evict(): void {
    // Never evict pinned items
    const candidates = Array.from(this.items.entries())
      .filter(([, item]) => !item.pinned)
      .sort((a, b) => {
        // Evict least important first, then least recently used
        if (a[1].importance !== b[1].importance) return a[1].importance - b[1].importance;
        return a[1].lastAccessedAt - b[1].lastAccessedAt;
      });

    // Remove 10% of the oldest, least important
    const toRemove = Math.ceil(this.maxItems * 0.1);
    for (let i = 0; i < toRemove && i < candidates.length; i++) {
      this.items.delete(candidates[i][0]);
    }
    this.dirty = true;
  }

  private ensureDir(): void {
    try { fs.mkdirSync(this.dataPath, { recursive: true }); } catch { /* ignore */ }
  }

  private loadData(): void {
    try {
      const memFile = path.join(this.dataPath, 'memory.json');
      if (fs.existsSync(memFile)) {
        const data: Array<[string, MemoryItem]> = JSON.parse(fs.readFileSync(memFile, 'utf-8'));
        this.items = new Map(data);
      }
    } catch {
      this.items = new Map();
    }
  }

  private generateId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `mem_${ts}_${rand}`;
  }
}
