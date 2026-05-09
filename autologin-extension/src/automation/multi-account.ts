/**
 * Task 9: Multi-Account Manager
 * Handles multiple accounts with session isolation, proxy rotation, and fingerprinting
 */

import { ProxyManager, ProxyRotationStrategy } from './proxy';
import { AntiDetection } from './anti-detection';
import type { Credential, BrowserFingerprint } from '../types';

export interface AccountSession {
  accountId: string;
  cookies: any[];
  lastLogin?: Date;
  lastError?: string;
  proxyUrl?: string;
  fingerprint?: BrowserFingerprint;
}

export interface ScheduledAccount {
  credential: Credential;
  interval_ms?: number;
  nextRun?: Date;
  lastRun?: Date;
}

export interface AccountStatistics {
  loginAttempts: number;
  successfulLogins: number;
  failedLogins: number;
  successRate: number;
  averageLoginDuration_ms: number;
}

export interface GlobalStatistics {
  totalLogins: number;
  totalSuccessful: number;
  totalFailed: number;
  averageSuccessRate: number;
}

export interface ProxyStatistics {
  totalRequests: number;
  averageResponseTime_ms: number;
  healthyProxies: number;
  unhealthyProxies: number;
}

export interface MultiAccountConfig {
  proxies: any[];
  rotationStrategy?: ProxyRotationStrategy | ((proxies: any[]) => any);
}

export class MultiAccountManager {
  private proxyManager: ProxyManager;
  private antiDetection: AntiDetection;
  private sessions: Map<string, AccountSession> = new Map();
  private fingerprints: Map<string, BrowserFingerprint> = new Map();
  private accountProxies: Map<string, any> = new Map();
  private schedule: ScheduledAccount[] = [];
  private statistics: Map<string, AccountStatistics> = new Map();
  private requestTimestamps: Map<string, number[]> = new Map();
  private pausedAccounts: Set<string> = new Set();
  private accounts: Credential[] = [];

  constructor(config: MultiAccountConfig) {
    this.proxyManager = new ProxyManager(config.proxies);
    this.antiDetection = new AntiDetection();
  }

  // Session Management

  getAccountSession(accountId: string): AccountSession {
    if (!this.sessions.has(accountId)) {
      this.sessions.set(accountId, {
        accountId,
        cookies: [],
      });
    }
    return this.sessions.get(accountId)!;
  }

  // Proxy Management

  getProxyForAccount(accountId: string): any {
    if (!this.accountProxies.has(accountId)) {
      const proxy = this.proxyManager.getNextProxy();
      this.accountProxies.set(accountId, proxy);
    }
    return this.accountProxies.get(accountId)!;
  }

  recordProxySuccess(accountId: string, responseTime_ms?: number): void {
    const proxy = this.getProxyForAccount(accountId);
    this.proxyManager.recordProxySuccess(proxy, responseTime_ms);
  }

  recordProxyFailure(accountId: string): void {
    const proxy = this.getProxyForAccount(accountId);
    this.proxyManager.recordProxyFailure(proxy);
  }

  // Fingerprint Management

  getFingerprintForAccount(accountId: string): BrowserFingerprint {
    if (!this.fingerprints.has(accountId)) {
      // Generate random fingerprint (not seeded so each account gets unique FP)
      const fp = this.antiDetection.getRandomFingerprint();
      this.fingerprints.set(accountId, fp);
    }
    return this.fingerprints.get(accountId)!;
  }

  getHeadersForAccount(accountId: string): Record<string, string> {
    const fp = this.getFingerprintForAccount(accountId);
    const headers = this.antiDetection.getAntiDetectionHeaders();
    // Override with fingerprint's User-Agent to maintain consistency
    headers['User-Agent'] = fp.userAgent;
    headers['Accept-Language'] = fp.language;
    return headers;
  }

  // Scheduling

  scheduleAccount(credential: Credential, options: { interval_ms?: number; nextRun?: Date }): void {
    const existing = this.schedule.findIndex(s => s.credential.id === credential.id);

    const scheduled: ScheduledAccount = {
      credential,
      ...options,
    };

    if (options.nextRun === undefined && options.interval_ms !== undefined) {
      scheduled.nextRun = new Date(Date.now() + options.interval_ms);
    }

    if (existing >= 0) {
      this.schedule[existing] = scheduled;
    } else {
      this.schedule.push(scheduled);
    }
  }

  getSchedule(): ScheduledAccount[] {
    return this.schedule;
  }

  getReadyAccounts(): Credential[] {
    const now = new Date();
    return this.schedule
      .filter(s => s.nextRun && s.nextRun <= now)
      .map(s => s.credential);
  }

  markAccountAsRun(accountId: string): void {
    const scheduled = this.schedule.find(s => s.credential.id === accountId);
    if (scheduled) {
      scheduled.lastRun = new Date();
      if (scheduled.interval_ms !== undefined) {
        scheduled.nextRun = new Date(Date.now() + scheduled.interval_ms);
      }
    }
  }

  // Rate Limiting

  recordRequest(accountId: string): void {
    if (!this.requestTimestamps.has(accountId)) {
      this.requestTimestamps.set(accountId, []);
    }
    const timestamps = this.requestTimestamps.get(accountId)!;
    timestamps.push(Date.now());
  }

  isAccountRateLimited(accountId: string, requestsPerWindow: number): boolean {
    const timestamps = this.requestTimestamps.get(accountId);
    if (!timestamps || timestamps.length === 0) {
      return false;
    }

    // Count requests in last 10 seconds
    const now = Date.now();
    const windowStart = now - 10000;
    const recentRequests = timestamps.filter(t => t >= windowStart);

    return recentRequests.length > requestsPerWindow;
  }

  // Statistics

  recordLoginAttempt(accountId: string, success: boolean, duration_ms: number): void {
    if (!this.statistics.has(accountId)) {
      this.statistics.set(accountId, {
        loginAttempts: 0,
        successfulLogins: 0,
        failedLogins: 0,
        successRate: 0,
        averageLoginDuration_ms: 0,
      });
    }

    const stats = this.statistics.get(accountId)!;
    stats.loginAttempts++;

    if (success) {
      stats.successfulLogins++;
    } else {
      stats.failedLogins++;
    }

    // Update average duration
    stats.averageLoginDuration_ms =
      (stats.averageLoginDuration_ms * (stats.loginAttempts - 1) + duration_ms) /
      stats.loginAttempts;

    // Update success rate
    stats.successRate =
      stats.loginAttempts > 0 ? stats.successfulLogins / stats.loginAttempts : 0;
  }

  getAccountStatistics(accountId: string): AccountStatistics {
    return (
      this.statistics.get(accountId) || {
        loginAttempts: 0,
        successfulLogins: 0,
        failedLogins: 0,
        successRate: 0,
        averageLoginDuration_ms: 0,
      }
    );
  }

  getGlobalStatistics(): GlobalStatistics {
    let totalLogins = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;

    this.statistics.forEach(stats => {
      totalLogins += stats.loginAttempts;
      totalSuccessful += stats.successfulLogins;
      totalFailed += stats.failedLogins;
    });

    return {
      totalLogins,
      totalSuccessful,
      totalFailed,
      averageSuccessRate:
        totalLogins > 0 ? totalSuccessful / totalLogins : 0,
    };
  }

  getProxyStatistics(): ProxyStatistics {
    const proxyStats = this.proxyManager.getStatistics();
    const health = this.proxyManager.getProxyHealth();

    const healthyProxies = health.filter(h => h.healthy).length;
    const unhealthyProxies = health.filter(h => !h.healthy).length;

    return {
      totalRequests: proxyStats.totalRotations,
      averageResponseTime_ms: proxyStats.averageResponseTime_ms,
      healthyProxies,
      unhealthyProxies,
    };
  }

  // Account Management

  addAccount(credential: Credential): void {
    if (!this.accounts.find(a => a.id === credential.id)) {
      this.accounts.push(credential);
    }
  }

  removeAccount(accountId: string): void {
    this.accounts = this.accounts.filter(a => a.id !== accountId);
    this.sessions.delete(accountId);
    this.fingerprints.delete(accountId);
    this.accountProxies.delete(accountId);
    this.statistics.delete(accountId);
    this.requestTimestamps.delete(accountId);
    this.schedule = this.schedule.filter(s => s.credential.id !== accountId);
    this.pausedAccounts.delete(accountId);
  }

  getAccounts(): Credential[] {
    return this.accounts;
  }

  reset(): void {
    this.accounts = [];
    this.sessions.clear();
    this.fingerprints.clear();
    this.accountProxies.clear();
    this.statistics.clear();
    this.requestTimestamps.clear();
    this.schedule = [];
    this.pausedAccounts.clear();
  }

  pauseAccount(accountId: string): void {
    this.pausedAccounts.add(accountId);
  }

  resumeAccount(accountId: string): void {
    this.pausedAccounts.delete(accountId);
  }

  isAccountPaused(accountId: string): boolean {
    return this.pausedAccounts.has(accountId);
  }
}
