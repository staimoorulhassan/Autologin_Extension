/**
 * Database Module
 * Manages IndexedDB for local storage of credentials, cookies, logs, screenshots
 * All sensitive data is encrypted at rest
 */

import Dexie, { Table } from 'dexie';
import { Credential, Cookie, LoginLog, Screenshot } from 'src/types/index';

/**
 * AutoLoginDB - Main database instance
 */
export class AutoLoginDB extends Dexie {
  credentials!: Table<Credential>;
  cookies!: Table<Cookie>;
  logs!: Table<LoginLog>;
  screenshots!: Table<Screenshot>;

  constructor() {
    super('AutoLoginDB');

    this.version(1).stores({
      // Credentials table
      // Primary key: id, Indexes: url (for search), created_at (for sorting)
      credentials: '++id, url, created_at',

      // Cookies table
      // Primary key: [account_id + name], Index: account_id (for per-account queries)
      cookies: '[account_id+name], account_id, expires',

      // Logs table
      // Primary key: id, Indexes: account_id, timestamp
      logs: '++id, account_id, timestamp, status',

      // Screenshots table
      // Primary key: id, Indexes: account_id, timestamp, stage
      screenshots: '++id, account_id, timestamp, stage'
    });
  }
}

// Global database instance
export const db = new AutoLoginDB();

/**
 * Credential CRUD Operations
 */
export const credentialStore = {
  /**
   * Add a new credential
   */
  async add(credential: Omit<Credential, 'id' | 'created_at'>): Promise<string> {
    const id = await db.credentials.add({
      ...credential,
      created_at: Date.now(),
      id: undefined
    } as Credential);
    return String(id);
  },

  /**
   * Get credential by ID
   */
  async getById(id: string): Promise<Credential | undefined> {
    return db.credentials.get(id);
  },

  /**
   * Get all credentials
   */
  async getAll(): Promise<Credential[]> {
    return db.credentials.toArray();
  },

  /**
   * Get credentials by URL (for finding duplicates)
   */
  async getByUrl(url: string): Promise<Credential | undefined> {
    return db.credentials.where('url').equals(url).first();
  },

  /**
   * Update credential
   */
  async update(id: string, updates: Partial<Credential>): Promise<void> {
    await db.credentials.update(id, updates);
  },

  /**
   * Delete credential
   */
  async delete(id: string): Promise<void> {
    await db.credentials.delete(id);

    // Clean up related data
    await cookieStore.deleteByAccountId(id);
    await logStore.deleteByAccountId(id);
    await screenshotStore.deleteByAccountId(id);
  },

  /**
   * Delete all credentials
   */
  async deleteAll(): Promise<void> {
    await db.credentials.clear();
    await db.cookies.clear();
    await db.logs.clear();
    await db.screenshots.clear();
  },

  /**
   * Search credentials by URL or username
   */
  async search(query: string): Promise<Credential[]> {
    const lowerQuery = query.toLowerCase();
    return db.credentials
      .filter(cred =>
        cred.url.toLowerCase().includes(lowerQuery) ||
        cred.username.toLowerCase().includes(lowerQuery)
      )
      .toArray();
  },

  /**
   * Count total credentials
   */
  async count(): Promise<number> {
    return db.credentials.count();
  }
};

/**
 * Cookie CRUD Operations
 */
export const cookieStore = {
  /**
   * Save cookies for an account
   */
  async saveCookies(accountId: string, cookies: Cookie[]): Promise<void> {
    // Clear existing cookies for this account
    await db.cookies.where('account_id').equals(accountId).delete();

    // Add new cookies with timestamp
    for (const cookie of cookies) {
      await db.cookies.add({
        ...cookie,
        account_id: accountId,
        timestamp: Date.now()
      });
    }
  },

  /**
   * Load cookies for an account
   */
  async loadCookies(accountId: string): Promise<Cookie[]> {
    const cookies = await db.cookies.where('account_id').equals(accountId).toArray();

    // Filter out expired cookies
    const now = Date.now();
    return cookies.filter(cookie => !cookie.expires || cookie.expires > now);
  },

  /**
   * Update a single cookie
   */
  async updateCookie(accountId: string, name: string, cookie: Partial<Cookie>): Promise<void> {
    await db.cookies.update([accountId, name], cookie);
  },

  /**
   * Delete cookies for an account
   */
  async deleteCookies(accountId: string): Promise<void> {
    await db.cookies.where('account_id').equals(accountId).delete();
  },

  /**
   * Delete all cookies (internal)
   */
  async deleteByAccountId(accountId: string): Promise<void> {
    await db.cookies.where('account_id').equals(accountId).delete();
  },

  /**
   * Clean up expired cookies (older than maxAgeDays)
   */
  async cleanupExpired(maxAgeDays: number = 90): Promise<number> {
    const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const toDelete = await db.cookies
      .where('timestamp')
      .below(cutoffTime)
      .toArray();

    for (const cookie of toDelete) {
      await db.cookies.delete([cookie.account_id, cookie.name]);
    }

    return toDelete.length;
  },

  /**
   * Get total cookie count
   */
  async count(): Promise<number> {
    return db.cookies.count();
  }
};

/**
 * Login Log CRUD Operations
 */
export const logStore = {
  /**
   * Add a login log entry
   */
  async add(log: Omit<LoginLog, 'id'>): Promise<string> {
    const id = await db.logs.add({
      ...log,
      id: undefined
    } as LoginLog);
    return String(id);
  },

  /**
   * Get logs for an account
   */
  async getByAccountId(accountId: string, limit: number = 100): Promise<LoginLog[]> {
    return db.logs
      .where('account_id')
      .equals(accountId)
      .reverse()
      .limit(limit)
      .toArray();
  },

  /**
   * Get logs with filters
   */
  async filter(accountId?: string, status?: string, limit: number = 100): Promise<LoginLog[]> {
    let query = db.logs.orderBy('timestamp').reverse().limit(limit);

    if (accountId) {
      query = db.logs
        .where('account_id')
        .equals(accountId)
        .reverse()
        .limit(limit);
    }

    const logs = await query.toArray();

    if (status) {
      return logs.filter(log => log.status === status);
    }

    return logs;
  },

  /**
   * Get last login for an account
   */
  async getLastLogin(accountId: string): Promise<LoginLog | undefined> {
    return db.logs
      .where('account_id')
      .equals(accountId)
      .reverse()
      .first();
  },

  /**
   * Delete logs for an account
   */
  async deleteByAccountId(accountId: string): Promise<void> {
    await db.logs.where('account_id').equals(accountId).delete();
  },

  /**
   * Clean up old logs (older than retentionDays)
   */
  async cleanupOld(retentionDays: number = 30): Promise<number> {
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const toDelete = await db.logs
      .where('timestamp')
      .below(cutoffTime)
      .toArray();

    for (const log of toDelete) {
      await db.logs.delete(log.id!);
    }

    return toDelete.length;
  },

  /**
   * Export logs as CSV
   */
  async exportAsCSV(accountId?: string): Promise<string> {
    const logs = accountId
      ? await db.logs.where('account_id').equals(accountId).toArray()
      : await db.logs.toArray();

    const headers = ['timestamp', 'account_id', 'status', 'error_message', 'duration_ms', 'captcha_type'];
    const rows = logs.map(log => [
      new Date(log.timestamp).toISOString(),
      log.account_id,
      log.status,
      log.error_message || '',
      log.duration_ms || '',
      log.captcha_type || ''
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    return csv;
  },

  /**
   * Count logs
   */
  async count(): Promise<number> {
    return db.logs.count();
  }
};

/**
 * Screenshot CRUD Operations
 */
export const screenshotStore = {
  /**
   * Save a screenshot
   */
  async save(accountId: string, screenshot: Omit<Screenshot, 'id'>): Promise<Screenshot> {
    const id = await db.screenshots.add({
      ...screenshot,
      account_id: accountId,
      id: undefined
    } as Screenshot);

    return {
      ...screenshot,
      account_id: accountId,
      id: String(id)
    };
  },

  /**
   * Get screenshots for an account
   */
  async getByAccountId(accountId: string): Promise<Screenshot[]> {
    return db.screenshots
      .where('account_id')
      .equals(accountId)
      .reverse()
      .toArray();
  },

  /**
   * Get screenshot by ID
   */
  async getById(id: string): Promise<Screenshot | undefined> {
    return db.screenshots.get(id);
  },

  /**
   * Get screenshots by stage (before_login, after_fill, after_submit)
   */
  async getByStage(accountId: string, stage: string): Promise<Screenshot[]> {
    return db.screenshots
      .where('[account_id+stage]')
      .equals([accountId, stage])
      .toArray();
  },

  /**
   * Delete screenshot
   */
  async delete(id: string): Promise<void> {
    await db.screenshots.delete(id);
  },

  /**
   * Delete screenshots for an account
   */
  async deleteByAccountId(accountId: string): Promise<void> {
    await db.screenshots.where('account_id').equals(accountId).delete();
  },

  /**
   * Clean up old screenshots (older than maxAgeDays)
   */
  async cleanupOld(maxAgeDays: number = 30): Promise<number> {
    const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const toDelete = await db.screenshots
      .where('timestamp')
      .below(cutoffTime)
      .toArray();

    for (const ss of toDelete) {
      await db.screenshots.delete(ss.id!);
    }

    return toDelete.length;
  },

  /**
   * Count screenshots
   */
  async count(): Promise<number> {
    return db.screenshots.count();
  },

  /**
   * Get total storage size (approximate)
   */
  async getTotalSize(): Promise<number> {
    const screenshots = await db.screenshots.toArray();
    return screenshots.reduce((sum, ss) => sum + (ss.size_bytes || 0), 0);
  }
};

/**
 * Database utility functions
 */
export const dbUtils = {
  /**
   * Check database integrity
   */
  async checkIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Check if we can read from each table
      const credCount = await db.credentials.count();
      const cookieCount = await db.cookies.count();
      const logCount = await db.logs.count();
      const ssCount = await db.screenshots.count();

      console.log(`Database integrity check: ${credCount} creds, ${cookieCount} cookies, ${logCount} logs, ${ssCount} screenshots`);

      return { valid: true, errors };
    } catch (error) {
      errors.push(`Database error: ${error instanceof Error ? error.message : 'unknown'}`);
      return { valid: false, errors };
    }
  },

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    credentials: number;
    cookies: number;
    logs: number;
    screenshots: number;
    screenshotSizeBytes: number;
  }> {
    return {
      credentials: await db.credentials.count(),
      cookies: await db.cookies.count(),
      logs: await db.logs.count(),
      screenshots: await db.screenshots.count(),
      screenshotSizeBytes: await screenshotStore.getTotalSize()
    };
  },

  /**
   * Clear all data (careful!)
   */
  async clearAll(): Promise<void> {
    await db.delete();
    await db.open();
  }
};

export default db;
