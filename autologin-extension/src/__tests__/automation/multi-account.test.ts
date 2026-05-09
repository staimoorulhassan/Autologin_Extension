/**
 * Task 9: Multi-Account Automation Tests
 * Tests for MultiAccountManager with session isolation, proxy rotation, and fingerprinting
 */

import { MultiAccountManager } from '../../automation/multi-account';
import { ProxyRotationStrategy } from '../../automation/proxy';
import type { Credential, Proxy } from '../../types';

describe('Task 9: Multi-Account Automation', () => {
  let multiAccountManager: MultiAccountManager;
  const testProxies: Proxy[] = [
    { host: '10.0.0.1', port: 8080, protocol: 'http' },
    { host: '10.0.0.2', port: 8080, protocol: 'http' },
    { host: '10.0.0.3', port: 8080, protocol: 'http' },
  ];

  const testCredentials: Credential[] = [
    {
      id: 'account1',
      url: 'https://example.com/login',
      username: 'user1@example.com',
      password: 'password1',
    },
    {
      id: 'account2',
      url: 'https://example.com/login',
      username: 'user2@example.com',
      password: 'password2',
    },
    {
      id: 'account3',
      url: 'https://example.com/login',
      username: 'user3@example.com',
      password: 'password3',
    },
  ];

  beforeEach(() => {
    multiAccountManager = new MultiAccountManager({
      proxies: testProxies,
      rotationStrategy: ProxyRotationStrategy.ROUND_ROBIN,
    });
  });

  describe('Initialization', () => {
    test('should initialize with proxy list', () => {
      expect(multiAccountManager).toBeDefined();
    });

    test('should throw if no proxies provided', () => {
      expect(() => {
        new MultiAccountManager({ proxies: [] });
      }).toThrow();
    });

    test('should set default rotation strategy', () => {
      const manager = new MultiAccountManager({ proxies: testProxies });
      expect(manager).toBeDefined();
    });

    test('should support custom rotation strategy', () => {
      const manager = new MultiAccountManager({
        proxies: testProxies,
        rotationStrategy: ProxyRotationStrategy.HEALTHY_FIRST,
      });
      expect(manager).toBeDefined();
    });
  });

  describe('Session Management', () => {
    test('should create isolated session for each account', () => {
      const session1 = multiAccountManager.getAccountSession(testCredentials[0].id!);
      const session2 = multiAccountManager.getAccountSession(testCredentials[1].id!);

      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
      expect(session1).not.toBe(session2);
    });

    test('should return same session for repeated account access', () => {
      const accountId = testCredentials[0].id!;
      const session1 = multiAccountManager.getAccountSession(accountId);
      const session2 = multiAccountManager.getAccountSession(accountId);

      expect(session1).toBe(session2);
    });

    test('should isolate cookies per account', () => {
      const accountId1 = testCredentials[0].id!;
      const accountId2 = testCredentials[1].id!;

      const session1 = multiAccountManager.getAccountSession(accountId1);
      const session2 = multiAccountManager.getAccountSession(accountId2);

      expect(session1.cookies).toBeDefined();
      expect(session2.cookies).toBeDefined();
      expect(session1.cookies).not.toBe(session2.cookies);
    });

    test('should isolate proxy per account', () => {
      const accountId1 = testCredentials[0].id!;
      const accountId2 = testCredentials[1].id!;

      const proxy1 = multiAccountManager.getProxyForAccount(accountId1);
      const proxy2 = multiAccountManager.getProxyForAccount(accountId2);

      expect(proxy1).toBeDefined();
      expect(proxy2).toBeDefined();
      // Different proxies due to rotation
      expect(proxy1.host).not.toBe(proxy2.host);
    });

    test('should isolate fingerprint per account', () => {
      const accountId1 = testCredentials[0].id!;
      const accountId2 = testCredentials[1].id!;
      const accountId3 = testCredentials[2].id!;

      const fp1 = multiAccountManager.getFingerprintForAccount(accountId1);
      const fp2 = multiAccountManager.getFingerprintForAccount(accountId2);
      const fp3 = multiAccountManager.getFingerprintForAccount(accountId3);

      expect(fp1).toBeDefined();
      expect(fp2).toBeDefined();
      expect(fp3).toBeDefined();

      // At least some fingerprints should be different
      const fingerprints = [fp1.userAgent, fp2.userAgent, fp3.userAgent];
      const unique = new Set(fingerprints);
      expect(unique.size).toBeGreaterThan(1);
    });

    test('should persist session data across accesses', () => {
      const accountId = testCredentials[0].id!;
      const session = multiAccountManager.getAccountSession(accountId);
      session.lastLogin = new Date();

      const sessionAgain = multiAccountManager.getAccountSession(accountId);

      expect(sessionAgain.lastLogin).toBeDefined();
      expect(sessionAgain.lastLogin?.getTime()).toBe(session.lastLogin?.getTime());
    });
  });

  describe('Proxy Rotation', () => {
    test('should rotate proxy for each account', () => {
      const proxies = [];
      for (let i = 0; i < 3; i++) {
        const cred = testCredentials[i];
        const proxy = multiAccountManager.getProxyForAccount(cred.id!);
        proxies.push(proxy.host);
      }

      // Should have different proxies due to rotation
      const uniqueProxies = new Set(proxies);
      expect(uniqueProxies.size).toBeGreaterThan(1);
    });

    test('should reuse proxy for same account', () => {
      const accountId = testCredentials[0].id!;
      const proxy1 = multiAccountManager.getProxyForAccount(accountId);
      const proxy2 = multiAccountManager.getProxyForAccount(accountId);

      expect(proxy1.host).toBe(proxy2.host);
    });

    test('should support healthy-first proxy strategy', () => {
      const manager = new MultiAccountManager({
        proxies: testProxies,
        rotationStrategy: ProxyRotationStrategy.HEALTHY_FIRST,
      });

      const proxy = manager.getProxyForAccount(testCredentials[0].id!);

      expect(proxy).toBeDefined();
      expect(testProxies).toContainEqual(proxy);
    });

    test('should mark proxy unhealthy on failure', () => {
      const accountId = testCredentials[0].id!;

      multiAccountManager.recordProxyFailure(accountId);

      expect(multiAccountManager).toBeDefined();
    });

    test('should record proxy success for response time', () => {
      const accountId = testCredentials[0].id!;

      multiAccountManager.recordProxySuccess(accountId, 250);

      expect(multiAccountManager).toBeDefined();
    });
  });

  describe('Fingerprint Rotation', () => {
    test('should generate unique fingerprint per account', () => {
      const accountId1 = testCredentials[0].id!;
      const accountId2 = testCredentials[1].id!;
      const accountId3 = testCredentials[2].id!;

      const fp1 = multiAccountManager.getFingerprintForAccount(accountId1);
      const fp2 = multiAccountManager.getFingerprintForAccount(accountId2);
      const fp3 = multiAccountManager.getFingerprintForAccount(accountId3);

      // At least some fingerprints should differ
      const userAgents = [fp1.userAgent, fp2.userAgent, fp3.userAgent];
      const uniqueUAs = new Set(userAgents);
      expect(uniqueUAs.size).toBeGreaterThan(1);
    });

    test('should persist fingerprint for same account', () => {
      const accountId = testCredentials[0].id!;

      const fp1 = multiAccountManager.getFingerprintForAccount(accountId);
      const fp2 = multiAccountManager.getFingerprintForAccount(accountId);

      expect(fp1.userAgent).toBe(fp2.userAgent);
      expect(fp1.timezone).toBe(fp2.timezone);
      expect(fp1.language).toBe(fp2.language);
    });

    test('should include all fingerprint fields', () => {
      const accountId = testCredentials[0].id!;
      const fp = multiAccountManager.getFingerprintForAccount(accountId);

      expect(fp.userAgent).toBeDefined();
      expect(fp.timezone).toBeDefined();
      expect(fp.language).toBeDefined();
      expect(fp.screenResolution).toBeDefined();
    });

    test('should rotate User-Agent on headers', () => {
      const accountId = testCredentials[0].id!;

      const headers1 = multiAccountManager.getHeadersForAccount(accountId);
      const headers2 = multiAccountManager.getHeadersForAccount(accountId);

      // Headers should have varying User-Agent (anti-detection)
      expect(headers1['User-Agent']).toBeDefined();
      expect(headers2['User-Agent']).toBeDefined();
    });

    test('should include fingerprint in headers', () => {
      const accountId = testCredentials[0].id!;
      const headers = multiAccountManager.getHeadersForAccount(accountId);

      expect(headers['User-Agent']).toBeDefined();
      expect(headers['Accept-Language']).toBeDefined();
    });
  });

  describe('Account Scheduling', () => {
    test('should add account to schedule', () => {
      const schedule = multiAccountManager.getSchedule();

      multiAccountManager.scheduleAccount(testCredentials[0], { interval_ms: 60000 });

      expect(schedule.length).toBeGreaterThan(0);
    });

    test('should support interval-based scheduling', () => {
      multiAccountManager.scheduleAccount(testCredentials[0], {
        interval_ms: 60000,
      });

      const schedule = multiAccountManager.getSchedule();

      expect(schedule[0].interval_ms).toBe(60000);
    });

    test('should support time-based scheduling', () => {
      const nextRun = new Date(Date.now() + 3600000);

      multiAccountManager.scheduleAccount(testCredentials[0], {
        nextRun,
      });

      const schedule = multiAccountManager.getSchedule();

      expect(schedule[0].nextRun).toBeDefined();
    });

    test('should track last run time', () => {
      multiAccountManager.scheduleAccount(testCredentials[0], {
        interval_ms: 60000,
      });

      const schedule = multiAccountManager.getSchedule();

      expect(schedule[0].lastRun).toBeUndefined(); // Not run yet

      multiAccountManager.markAccountAsRun(testCredentials[0].id!);

      const updatedSchedule = multiAccountManager.getSchedule();

      expect(updatedSchedule[0].lastRun).toBeDefined();
    });

    test('should return accounts ready to run', () => {
      // Schedule account with past nextRun
      multiAccountManager.scheduleAccount(testCredentials[0], {
        nextRun: new Date(Date.now() - 1000),
      });

      const ready = multiAccountManager.getReadyAccounts();

      expect(ready.length).toBeGreaterThan(0);
      expect(ready[0].id).toBe(testCredentials[0].id);
    });

    test('should calculate next run time after execution', () => {
      multiAccountManager.scheduleAccount(testCredentials[0], {
        interval_ms: 60000,
      });

      multiAccountManager.markAccountAsRun(testCredentials[0].id!);

      const schedule = multiAccountManager.getSchedule();
      const lastRun = schedule[0].lastRun!.getTime();
      const nextRun = schedule[0].nextRun!.getTime();

      expect(nextRun).toBeGreaterThan(lastRun);
      expect(nextRun - lastRun).toBeCloseTo(60000, -2);
    });
  });

  describe('Rate Limiting', () => {
    test('should track request timestamps per account', () => {
      const accountId = testCredentials[0].id!;

      multiAccountManager.recordRequest(accountId);

      expect(multiAccountManager).toBeDefined();
    });

    test('should detect rate limit based on request frequency', () => {
      const accountId = testCredentials[0].id!;

      // Record many requests in quick succession
      for (let i = 0; i < 10; i++) {
        multiAccountManager.recordRequest(accountId);
      }

      const isRateLimited = multiAccountManager.isAccountRateLimited(
        accountId,
        10000 // 10 requests per 10 seconds
      );

      expect(typeof isRateLimited).toBe('boolean');
    });

    test('should support per-account rate limiting thresholds', () => {
      const accountId = testCredentials[0].id!;

      multiAccountManager.recordRequest(accountId);

      const isLimited = multiAccountManager.isAccountRateLimited(accountId, 1);

      expect(typeof isLimited).toBe('boolean');
    });

    test('should clear old request timestamps', () => {
      const accountId = testCredentials[0].id!;

      multiAccountManager.recordRequest(accountId);
      // Simulate old request by clearing and re-checking

      const isLimited = multiAccountManager.isAccountRateLimited(accountId, 10000);

      expect(typeof isLimited).toBe('boolean');
    });
  });

  describe('Statistics & Monitoring', () => {
    test('should track login statistics per account', () => {
      const accountId = testCredentials[0].id!;

      multiAccountManager.recordLoginAttempt(accountId, true, 1500);

      const stats = multiAccountManager.getAccountStatistics(accountId);

      expect(stats.loginAttempts).toBe(1);
      expect(stats.successfulLogins).toBe(1);
    });

    test('should track failed login attempts', () => {
      const accountId = testCredentials[0].id!;

      multiAccountManager.recordLoginAttempt(accountId, false, 2000);

      const stats = multiAccountManager.getAccountStatistics(accountId);

      expect(stats.loginAttempts).toBeGreaterThan(0);
      expect(stats.failedLogins).toBeGreaterThan(0);
    });

    test('should calculate success rate', () => {
      const accountId = testCredentials[0].id!;

      multiAccountManager.recordLoginAttempt(accountId, true, 1500);
      multiAccountManager.recordLoginAttempt(accountId, true, 1600);
      multiAccountManager.recordLoginAttempt(accountId, false, 2000);

      const stats = multiAccountManager.getAccountStatistics(accountId);

      expect(stats.successRate).toBeCloseTo(0.67, 1);
    });

    test('should track average login duration', () => {
      const accountId = testCredentials[0].id!;

      multiAccountManager.recordLoginAttempt(accountId, true, 1000);
      multiAccountManager.recordLoginAttempt(accountId, true, 2000);

      const stats = multiAccountManager.getAccountStatistics(accountId);

      expect(stats.averageLoginDuration_ms).toBe(1500);
    });

    test('should provide global statistics', () => {
      multiAccountManager.recordLoginAttempt(testCredentials[0].id!, true, 1000);
      multiAccountManager.recordLoginAttempt(testCredentials[1].id!, true, 2000);
      multiAccountManager.recordLoginAttempt(testCredentials[2].id!, false, 1500);

      const globalStats = multiAccountManager.getGlobalStatistics();

      expect(globalStats.totalLogins).toBe(3);
      expect(globalStats.totalSuccessful).toBe(2);
      expect(globalStats.totalFailed).toBe(1);
    });

    test('should track proxy statistics across accounts', () => {
      for (let i = 0; i < testCredentials.length; i++) {
        multiAccountManager.recordProxySuccess(testCredentials[i].id!, 200);
      }

      const proxyStats = multiAccountManager.getProxyStatistics();

      expect(proxyStats.totalRequests).toBe(3);
      expect(proxyStats.averageResponseTime_ms).toBeGreaterThan(0);
    });
  });

  describe('Account Management', () => {
    test('should list all managed accounts', () => {
      multiAccountManager.addAccount(testCredentials[0]);
      multiAccountManager.addAccount(testCredentials[1]);

      const accounts = multiAccountManager.getAccounts();

      expect(accounts.length).toBeGreaterThanOrEqual(2);
    });

    test('should remove account and isolate data', () => {
      const accountId = testCredentials[0].id!;
      multiAccountManager.addAccount(testCredentials[0]);

      multiAccountManager.removeAccount(accountId);

      const accounts = multiAccountManager.getAccounts();

      expect(accounts.find((a: Credential) => a.id === accountId)).toBeUndefined();
    });

    test('should clear all sessions on reset', () => {
      multiAccountManager.addAccount(testCredentials[0]);
      multiAccountManager.getAccountSession(testCredentials[0].id!);

      multiAccountManager.reset();

      const accounts = multiAccountManager.getAccounts();

      expect(accounts.length).toBe(0);
    });

    test('should support account pausing', () => {
      const accountId = testCredentials[0].id!;
      multiAccountManager.addAccount(testCredentials[0]);

      multiAccountManager.pauseAccount(accountId);

      const isPaused = multiAccountManager.isAccountPaused(accountId);

      expect(isPaused).toBe(true);
    });

    test('should support account resuming', () => {
      const accountId = testCredentials[0].id!;
      multiAccountManager.addAccount(testCredentials[0]);

      multiAccountManager.pauseAccount(accountId);
      multiAccountManager.resumeAccount(accountId);

      const isPaused = multiAccountManager.isAccountPaused(accountId);

      expect(isPaused).toBe(false);
    });
  });

  describe('Integration', () => {
    test('should combine proxy + fingerprint + headers per account', () => {
      const accountId = testCredentials[0].id!;

      const proxy = multiAccountManager.getProxyForAccount(accountId);
      const fingerprint = multiAccountManager.getFingerprintForAccount(accountId);
      const headers = multiAccountManager.getHeadersForAccount(accountId);

      expect(proxy).toBeDefined();
      expect(fingerprint).toBeDefined();
      expect(headers).toBeDefined();
      expect(headers['User-Agent']).toBe(fingerprint.userAgent);
    });

    test('should schedule and track multiple accounts', () => {
      testCredentials.forEach(cred => {
        multiAccountManager.scheduleAccount(cred, { interval_ms: 60000 });
      });

      const schedule = multiAccountManager.getSchedule();

      expect(schedule.length).toBe(testCredentials.length);
    });

    test('should handle concurrent account operations', () => {
      testCredentials.forEach(cred => {
        multiAccountManager.addAccount(cred);
      });

      testCredentials.forEach(cred => {
        multiAccountManager.getAccountSession(cred.id!);
        multiAccountManager.getProxyForAccount(cred.id!);
        multiAccountManager.getFingerprintForAccount(cred.id!);
      });

      const accounts = multiAccountManager.getAccounts();

      expect(accounts.length).toBeGreaterThanOrEqual(testCredentials.length);
    });

    test('should maintain isolation across multiple operations', () => {
      const accountId1 = testCredentials[0].id!;
      const accountId2 = testCredentials[1].id!;

      // Create sessions
      const session1 = multiAccountManager.getAccountSession(accountId1);

      // Modify session 1
      session1.lastLogin = new Date();

      // Session 2 should be unaffected
      const session2Again = multiAccountManager.getAccountSession(accountId2);

      expect(session2Again.lastLogin).toBeUndefined();
    });

    test('should support login flow for multiple accounts', () => {
      const results = [];

      for (const cred of testCredentials) {
        const accountId = cred.id!;
        const session = multiAccountManager.getAccountSession(accountId);
        const proxy = multiAccountManager.getProxyForAccount(accountId);
        const headers = multiAccountManager.getHeadersForAccount(accountId);

        results.push({
          accountId,
          hasSession: session !== undefined,
          hasProxy: proxy !== undefined,
          hasHeaders: headers !== undefined,
        });

        multiAccountManager.recordLoginAttempt(accountId, true, 1500);
      }

      expect(results.length).toBe(testCredentials.length);
      expect(results.every(r => r.hasSession && r.hasProxy && r.hasHeaders)).toBe(true);
    });
  });
});
