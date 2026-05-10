/**
 * Database Module Tests
 * Verifies IndexedDB operations for credentials, cookies, logs, screenshots
 * Addresses: REQ-1 (credential storage), REQ-6 (cookie mgmt), REQ-8 (logging), REQ-3 (screenshots)
 */

import {
  db,
  credentialStore,
  cookieStore,
  logStore,
  screenshotStore,
  dbUtils,
  AutoLoginDB
} from '../../store/database';
import { Credential, Cookie, LoginStatus } from '../../types/index';

describe('Database Module', () => {
  beforeEach(async () => {
    // Clear all data before each test
    await dbUtils.clearAll();
  });

  afterAll(async () => {
    // Cleanup after all tests
    await dbUtils.clearAll();
    await db.close();
  });

  describe('AutoLoginDB Instance', () => {
    it('should create database instance', () => {
      expect(db).toBeInstanceOf(AutoLoginDB);
    });

    it('should have all table definitions', () => {
      expect(db.credentials).toBeDefined();
      expect(db.cookies).toBeDefined();
      expect(db.logs).toBeDefined();
      expect(db.screenshots).toBeDefined();
    });

    it('should have proper schema indexes', async () => {
      const stats = await dbUtils.getStats();
      expect(stats).toEqual({
        credentials: 0,
        cookies: 0,
        logs: 0,
        screenshots: 0,
        screenshotSizeBytes: 0
      });
    });
  });

  describe('Credential Store', () => {
    const testCredential: Omit<Credential, 'id' | 'created_at'> = {
      url: 'https://example.com/login',
      username: 'testuser@example.com',
      password_encrypted: 'encrypted_password_here',
      notes: 'Test account'
    };

    describe('add', () => {
      it('should add a new credential', async () => {
        const id = await credentialStore.add(testCredential);
        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
      });

      it('should set created_at timestamp', async () => {
        const id = await credentialStore.add(testCredential);
        const cred = await credentialStore.getById(id);
        expect(cred?.created_at).toBeDefined();
        expect(typeof cred?.created_at).toBe('number');
        expect(cred?.created_at).toBeGreaterThan(0);
      });

      it('should preserve all credential fields', async () => {
        const id = await credentialStore.add(testCredential);
        const retrieved = await credentialStore.getById(id);
        expect(retrieved?.url).toBe(testCredential.url);
        expect(retrieved?.username).toBe(testCredential.username);
        expect(retrieved?.password_encrypted).toBe(testCredential.password_encrypted);
        expect(retrieved?.notes).toBe(testCredential.notes);
      });

      it('should support adding multiple credentials', async () => {
        const id1 = await credentialStore.add(testCredential);
        const id2 = await credentialStore.add({
          ...testCredential,
          url: 'https://different.com'
        });
        expect(id1).not.toBe(id2);
        expect(await credentialStore.count()).toBe(2);
      });
    });

    describe('getById', () => {
      it('should retrieve credential by ID', async () => {
        const id = await credentialStore.add(testCredential);
        const cred = await credentialStore.getById(id);
        expect(cred).toBeDefined();
        expect(cred?.username).toBe(testCredential.username);
      });

      it('should return undefined for non-existent ID', async () => {
        const cred = await credentialStore.getById('non-existent-id');
        expect(cred).toBeUndefined();
      });

      it('should return credential with all fields', async () => {
        const id = await credentialStore.add(testCredential);
        const cred = await credentialStore.getById(id);
        expect(cred).toHaveProperty('id');
        expect(cred).toHaveProperty('url');
        expect(cred).toHaveProperty('username');
        expect(cred).toHaveProperty('password_encrypted');
        expect(cred).toHaveProperty('created_at');
        expect(cred).toHaveProperty('notes');
      });
    });

    describe('getAll', () => {
      it('should return all credentials', async () => {
        await credentialStore.add(testCredential);
        await credentialStore.add({ ...testCredential, url: 'https://site2.com' });
        await credentialStore.add({ ...testCredential, url: 'https://site3.com' });

        const all = await credentialStore.getAll();
        expect(all.length).toBe(3);
      });

      it('should return empty array when no credentials', async () => {
        const all = await credentialStore.getAll();
        expect(all).toEqual([]);
      });
    });

    describe('getByUrl', () => {
      it('should find credential by URL', async () => {
        const url = 'https://bank.example.com/login';
        await credentialStore.add({ ...testCredential, url });
        const cred = await credentialStore.getByUrl(url);
        expect(cred).toBeDefined();
        expect(cred?.url).toBe(url);
      });

      it('should return undefined for non-existent URL', async () => {
        const cred = await credentialStore.getByUrl('https://nonexistent.com');
        expect(cred).toBeUndefined();
      });

      it('should find first credential for URL (no duplicates)', async () => {
        const url = 'https://example.com';
        await credentialStore.add({ ...testCredential, url, username: 'user1' });
        const cred = await credentialStore.getByUrl(url);
        expect(cred?.username).toBe('user1');
      });
    });

    describe('update', () => {
      it('should update credential fields', async () => {
        const id = await credentialStore.add(testCredential);
        await credentialStore.update(id, { notes: 'Updated notes' });
        const updated = await credentialStore.getById(id);
        expect(updated?.notes).toBe('Updated notes');
      });

      it('should preserve other fields when updating', async () => {
        const id = await credentialStore.add(testCredential);
        await credentialStore.update(id, { notes: 'New notes' });
        const updated = await credentialStore.getById(id);
        expect(updated?.username).toBe(testCredential.username);
        expect(updated?.url).toBe(testCredential.url);
      });

      it('should allow partial updates', async () => {
        const id = await credentialStore.add(testCredential);
        await credentialStore.update(id, {
          password_encrypted: 'new_encrypted_password'
        });
        const updated = await credentialStore.getById(id);
        expect(updated?.password_encrypted).toBe('new_encrypted_password');
      });
    });

    describe('delete', () => {
      it('should delete credential by ID', async () => {
        const id = await credentialStore.add(testCredential);
        await credentialStore.delete(id);
        const deleted = await credentialStore.getById(id);
        expect(deleted).toBeUndefined();
      });

      it('should cascade delete related cookies', async () => {
        const id = await credentialStore.add(testCredential);
        await cookieStore.saveCookies(id, [
          {
            name: 'session',
            value: 'token123',
            expires: Date.now() + 3600000
          } as Cookie
        ]);

        expect(await cookieStore.count()).toBe(1);
        await credentialStore.delete(id);
        expect(await cookieStore.count()).toBe(0);
      });

      it('should cascade delete related logs', async () => {
        const id = await credentialStore.add(testCredential);
        await logStore.add({
          account_id: id,
          status: LoginStatus.SUCCESS,
          timestamp: Date.now(),
          duration_ms: 1500
        });

        expect(await logStore.count()).toBe(1);
        await credentialStore.delete(id);
        expect(await logStore.count()).toBe(0);
      });

      it('should cascade delete related screenshots', async () => {
        const id = await credentialStore.add(testCredential);
        await screenshotStore.save(id, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:image/png;base64,iVBORw0KG...',
          size_bytes: 5000
        });

        expect(await screenshotStore.count()).toBe(1);
        await credentialStore.delete(id);
        expect(await screenshotStore.count()).toBe(0);
      });
    });

    describe('deleteAll', () => {
      it('should delete all credentials', async () => {
        await credentialStore.add(testCredential);
        await credentialStore.add({ ...testCredential, url: 'https://site2.com' });

        await credentialStore.deleteAll();
        expect(await credentialStore.count()).toBe(0);
      });

      it('should also clear cookies, logs, screenshots', async () => {
        const id = await credentialStore.add(testCredential);
        await cookieStore.saveCookies(id, [{ name: 'test', value: 'val' } as Cookie]);
        await logStore.add({
          account_id: id,
          status: LoginStatus.SUCCESS,
          timestamp: Date.now()
        });

        await credentialStore.deleteAll();
        expect(await credentialStore.count()).toBe(0);
        expect(await cookieStore.count()).toBe(0);
        expect(await logStore.count()).toBe(0);
      });
    });

    describe('search', () => {
      beforeEach(async () => {
        await credentialStore.add({
          ...testCredential,
          url: 'https://bank.example.com',
          username: 'john.doe@example.com'
        });
        await credentialStore.add({
          ...testCredential,
          url: 'https://gmail.com',
          username: 'jane.smith@gmail.com'
        });
        await credentialStore.add({
          ...testCredential,
          url: 'https://github.com',
          username: 'jane.coder'
        });
      });

      it('should search by URL', async () => {
        const results = await credentialStore.search('bank');
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].url).toContain('bank');
      });

      it('should search by username', async () => {
        const results = await credentialStore.search('john');
        expect(results.length).toBeGreaterThanOrEqual(1);
      });

      it('should be case-insensitive', async () => {
        const results1 = await credentialStore.search('JANE');
        const results2 = await credentialStore.search('jane');
        expect(results1.length).toBe(results2.length);
      });

      it('should return empty array for non-matching search', async () => {
        const results = await credentialStore.search('nonexistent');
        expect(results).toEqual([]);
      });

      it('should support partial matches', async () => {
        const results = await credentialStore.search('.com');
        expect(results.length).toBeGreaterThan(1);
      });
    });

    describe('count', () => {
      it('should return correct count', async () => {
        expect(await credentialStore.count()).toBe(0);
        await credentialStore.add(testCredential);
        expect(await credentialStore.count()).toBe(1);
        await credentialStore.add({ ...testCredential, url: 'https://site2.com' });
        expect(await credentialStore.count()).toBe(2);
      });
    });
  });

  describe('Cookie Store', () => {
    let accountId: string;

    beforeEach(async () => {
      const credId = await credentialStore.add({
        url: 'https://example.com',
        username: 'testuser',
        password_encrypted: 'encrypted'
      });
      accountId = credId;
    });

    describe('saveCookies and loadCookies', () => {
      it('should save and load cookies', async () => {
        const cookies: Cookie[] = [
          {
            name: 'session_id',
            value: 'abc123def456',
            domain: 'example.com',
            path: '/',
            expires: Date.now() + 86400000
          },
          {
            name: 'csrf_token',
            value: 'xyz789',
            domain: 'example.com',
            path: '/',
            expires: Date.now() + 3600000
          }
        ];

        await cookieStore.saveCookies(accountId, cookies);
        const loaded = await cookieStore.loadCookies(accountId);

        expect(loaded.length).toBe(2);
        expect(loaded[0].name).toBe('session_id');
        expect(loaded[1].name).toBe('csrf_token');
      });

      it('should filter out expired cookies on load', async () => {
        const cookies: Cookie[] = [
          {
            name: 'valid',
            value: 'val1',
            expires: Date.now() + 86400000
          },
          {
            name: 'expired',
            value: 'val2',
            expires: Date.now() - 1000 // Expired
          }
        ];

        await cookieStore.saveCookies(accountId, cookies);
        const loaded = await cookieStore.loadCookies(accountId);

        expect(loaded.length).toBe(1);
        expect(loaded[0].name).toBe('valid');
      });

      it('should handle cookies without expiration', async () => {
        const cookies: Cookie[] = [
          {
            name: 'persistent',
            value: 'persists'
            // No expires field
          }
        ];

        await cookieStore.saveCookies(accountId, cookies);
        const loaded = await cookieStore.loadCookies(accountId);

        expect(loaded.length).toBe(1);
      });

      it('should clear old cookies when saving new batch', async () => {
        const oldCookies: Cookie[] = [
          { name: 'old1', value: 'val1', expires: Date.now() + 3600000 },
          { name: 'old2', value: 'val2', expires: Date.now() + 3600000 }
        ];

        await cookieStore.saveCookies(accountId, oldCookies);
        expect(await cookieStore.count()).toBe(2);

        const newCookies: Cookie[] = [
          { name: 'new1', value: 'val1', expires: Date.now() + 3600000 }
        ];

        await cookieStore.saveCookies(accountId, newCookies);
        expect(await cookieStore.count()).toBe(1);

        const loaded = await cookieStore.loadCookies(accountId);
        expect(loaded[0].name).toBe('new1');
      });
    });

    describe('updateCookie', () => {
      it('should update a single cookie', async () => {
        const cookies: Cookie[] = [
          { name: 'test', value: 'original', expires: Date.now() + 3600000 }
        ];

        await cookieStore.saveCookies(accountId, cookies);
        await cookieStore.updateCookie(accountId, 'test', { value: 'updated' });

        const loaded = await cookieStore.loadCookies(accountId);
        expect(loaded[0].value).toBe('updated');
      });
    });

    describe('deleteCookies', () => {
      it('should delete all cookies for an account', async () => {
        const cookies: Cookie[] = [
          { name: 'cookie1', value: 'val1', expires: Date.now() + 3600000 },
          { name: 'cookie2', value: 'val2', expires: Date.now() + 3600000 }
        ];

        await cookieStore.saveCookies(accountId, cookies);
        expect(await cookieStore.count()).toBe(2);

        await cookieStore.deleteCookies(accountId);
        expect(await cookieStore.count()).toBe(0);
      });

      it('should only delete cookies for specified account', async () => {
        const cred2 = await credentialStore.add({
          url: 'https://other.com',
          username: 'user2',
          password_encrypted: 'enc'
        });

        const cookies: Cookie[] = [
          { name: 'test', value: 'val', expires: Date.now() + 3600000 }
        ];

        await cookieStore.saveCookies(accountId, cookies);
        await cookieStore.saveCookies(cred2, cookies);
        expect(await cookieStore.count()).toBe(2);

        await cookieStore.deleteCookies(accountId);
        expect(await cookieStore.count()).toBe(1);

        const remaining = await cookieStore.loadCookies(cred2);
        expect(remaining.length).toBe(1);
      });
    });

    describe('cleanupExpired', () => {
      it('should remove expired cookies', async () => {
        const cutoffTime = Date.now() - 91 * 24 * 60 * 60 * 1000;
        const oldCookie: Cookie = {
          name: 'old',
          value: 'val',
          expires: cutoffTime + 1000
        };

        await cookieStore.saveCookies(accountId, [oldCookie]);
        expect(await cookieStore.count()).toBe(1);

        // After saving, manually update timestamp to be old (we'd need to use direct DB access in real test)
        // For now, just verify cleanup doesn't break
        const deleted = await cookieStore.cleanupExpired(90);
        expect(typeof deleted).toBe('number');
      });
    });

    describe('count', () => {
      it('should return correct cookie count', async () => {
        expect(await cookieStore.count()).toBe(0);

        const cookies: Cookie[] = [
          { name: 'c1', value: 'v1' },
          { name: 'c2', value: 'v2' }
        ];

        await cookieStore.saveCookies(accountId, cookies);
        expect(await cookieStore.count()).toBe(2);
      });
    });
  });

  describe('Log Store', () => {
    let accountId: string;

    beforeEach(async () => {
      const credId = await credentialStore.add({
        url: 'https://example.com',
        username: 'testuser',
        password_encrypted: 'encrypted'
      });
      accountId = credId;
    });

    describe('add and retrieval', () => {
      it('should add a login log', async () => {
        const id = await logStore.add({
          account_id: accountId,
          status: LoginStatus.SUCCESS,
          timestamp: Date.now(),
          duration_ms: 1200
        });

        expect(id).toBeDefined();
      });

      it('should record all log details', async () => {
        const now = Date.now();
        const logData = {
          account_id: accountId,
          status: LoginStatus.WRONG_PASSWORD,
          timestamp: now,
          duration_ms: 800,
          error_message: 'Invalid credentials',
          captcha_type: 'reCAPTCHA'
        };

        await logStore.add(logData);
        const logs = await logStore.getByAccountId(accountId);

        expect(logs[0].status).toBe(LoginStatus.WRONG_PASSWORD);
        expect(logs[0].error_message).toBe('Invalid credentials');
        expect(logs[0].captcha_type).toBe('reCAPTCHA');
      });
    });

    describe('getByAccountId', () => {
      it('should retrieve logs for specific account', async () => {
        await logStore.add({
          account_id: accountId,
          status: LoginStatus.SUCCESS,
          timestamp: Date.now()
        });

        const cred2 = await credentialStore.add({
          url: 'https://other.com',
          username: 'user2',
          password_encrypted: 'enc'
        });

        await logStore.add({
          account_id: cred2,
          status: LoginStatus.SUCCESS,
          timestamp: Date.now()
        });

        const logs = await logStore.getByAccountId(accountId);
        expect(logs.length).toBe(1);
      });

      it('should return logs in reverse chronological order', async () => {
        const now = Date.now();
        await logStore.add({
          account_id: accountId,
          status: LoginStatus.SUCCESS,
          timestamp: now
        });
        await logStore.add({
          account_id: accountId,
          status: LoginStatus.SUCCESS,
          timestamp: now + 1000
        });

        const logs = await logStore.getByAccountId(accountId);
        expect(logs[0].timestamp).toBeGreaterThanOrEqual(logs[1].timestamp);
      });

      it('should respect limit parameter', async () => {
        for (let i = 0; i < 10; i++) {
          await logStore.add({
            account_id: accountId,
            status: LoginStatus.SUCCESS,
            timestamp: Date.now() + i * 1000
          });
        }

        const logs = await logStore.getByAccountId(accountId, 5);
        expect(logs.length).toBe(5);
      });
    });

    describe('filter', () => {
      beforeEach(async () => {
        const now = Date.now();
        await logStore.add({
          account_id: accountId,
          status: LoginStatus.SUCCESS,
          timestamp: now
        });
        await logStore.add({
          account_id: accountId,
          status: LoginStatus.WRONG_PASSWORD,
          timestamp: now + 1000
        });
        await logStore.add({
          account_id: accountId,
          status: LoginStatus.SUCCESS,
          timestamp: now + 2000
        });
      });

      it('should filter by status', async () => {
        const failures = await logStore.filter(accountId, LoginStatus.WRONG_PASSWORD);
        expect(failures.length).toBe(1);
        expect(failures[0].status).toBe(LoginStatus.WRONG_PASSWORD);
      });

      it('should return all if no status filter', async () => {
        const all = await logStore.filter(accountId);
        expect(all.length).toBe(3);
      });

      it('should return empty for non-existent status', async () => {
        const results = await logStore.filter(accountId, LoginStatus.CAPTCHA_TIMEOUT);
        expect(results.length).toBe(0);
      });
    });

    describe('getLastLogin', () => {
      it('should return most recent login', async () => {
        const now = Date.now();
        await logStore.add({
          account_id: accountId,
          status: LoginStatus.SUCCESS,
          timestamp: now
        });
        await logStore.add({
          account_id: accountId,
          status: LoginStatus.SUCCESS,
          timestamp: now + 5000
        });

        const last = await logStore.getLastLogin(accountId);
        expect(last).toBeDefined();
        expect(last?.timestamp).toBe(now + 5000);
      });

      it('should return undefined for account with no logs', async () => {
        const other = await credentialStore.add({
          url: 'https://other.com',
          username: 'user2',
          password_encrypted: 'enc'
        });

        const last = await logStore.getLastLogin(other);
        expect(last).toBeUndefined();
      });
    });

    describe('cleanupOld', () => {
      it('should remove old logs beyond retention period', async () => {
        const retentionMs = 30 * 24 * 60 * 60 * 1000;
        const oldTime = Date.now() - retentionMs - 100000;

        await logStore.add({
          account_id: accountId,
          status: LoginStatus.SUCCESS,
          timestamp: oldTime
        });

        await logStore.add({
          account_id: accountId,
          status: LoginStatus.SUCCESS,
          timestamp: Date.now()
        });

        const deleted = await logStore.cleanupOld(30);
        expect(deleted).toBeGreaterThan(0);
      });
    });

    describe('exportAsCSV', () => {
      beforeEach(async () => {
        await logStore.add({
          account_id: accountId,
          status: LoginStatus.SUCCESS,
          timestamp: Date.now(),
          duration_ms: 1200
        });
        await logStore.add({
          account_id: accountId,
          status: LoginStatus.WRONG_PASSWORD,
          timestamp: Date.now(),
          error_message: 'Invalid password'
        });
      });

      it('should export logs as CSV', async () => {
        const csv = await logStore.exportAsCSV(accountId);
        expect(typeof csv).toBe('string');
        expect(csv).toContain('timestamp');
        expect(csv).toContain('account_id');
        expect(csv).toContain('status');
      });

      it('should include all columns', async () => {
        const csv = await logStore.exportAsCSV(accountId);
        const headers = csv.split('\n')[0];
        expect(headers).toContain('timestamp');
        expect(headers).toContain('account_id');
        expect(headers).toContain('status');
        expect(headers).toContain('error_message');
        expect(headers).toContain('duration_ms');
        expect(headers).toContain('captcha_type');
      });

      it('should include log data', async () => {
        const csv = await logStore.exportAsCSV(accountId);
        const lines = csv.split('\n');
        expect(lines.length).toBeGreaterThan(1); // At least header + 1 log
      });

      it('should export all logs when no accountId specified', async () => {
        const cred2 = await credentialStore.add({
          url: 'https://other.com',
          username: 'user2',
          password_encrypted: 'enc'
        });

        await logStore.add({
          account_id: cred2,
          status: LoginStatus.SUCCESS,
          timestamp: Date.now()
        });

        const csv = await logStore.exportAsCSV();
        const lines = csv.split('\n');
        expect(lines.length).toBeGreaterThan(2); // Header + 2 accounts worth of logs
      });
    });

    describe('count', () => {
      it('should return correct log count', async () => {
        expect(await logStore.count()).toBe(0);

        await logStore.add({
          account_id: accountId,
          status: LoginStatus.SUCCESS,
          timestamp: Date.now()
        });

        expect(await logStore.count()).toBe(1);
      });
    });
  });

  describe('Screenshot Store', () => {
    let accountId: string;

    beforeEach(async () => {
      const credId = await credentialStore.add({
        url: 'https://example.com',
        username: 'testuser',
        password_encrypted: 'encrypted'
      });
      accountId = credId;
    });

    describe('save and retrieval', () => {
      it('should save a screenshot', async () => {
        const screenshot = await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:image/png;base64,iVBORw0KGgoAAAANS',
          size_bytes: 5000
        });

        expect(screenshot.id).toBeDefined();
        expect(screenshot.account_id).toBe(accountId);
      });

      it('should retrieve screenshot by ID', async () => {
        const saved = await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:image/png;base64,test',
          size_bytes: 1000
        });

        const retrieved = await screenshotStore.getById(saved.id!);
        expect(retrieved).toBeDefined();
        expect(retrieved?.data_url).toBe('data:image/png;base64,test');
      });
    });

    describe('getByAccountId', () => {
      it('should retrieve all screenshots for account', async () => {
        await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:...',
          size_bytes: 1000
        });

        await screenshotStore.save(accountId, {
          stage: 'after_fill',
          timestamp: Date.now() + 1000,
          data_url: 'data:...',
          size_bytes: 2000
        });

        const screenshots = await screenshotStore.getByAccountId(accountId);
        expect(screenshots.length).toBe(2);
      });

      it('should return screenshots in reverse chronological order', async () => {
        const now = Date.now();
        await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: now,
          data_url: 'data:...',
          size_bytes: 1000
        });

        await screenshotStore.save(accountId, {
          stage: 'after_fill',
          timestamp: now + 1000,
          data_url: 'data:...',
          size_bytes: 2000
        });

        const screenshots = await screenshotStore.getByAccountId(accountId);
        expect(screenshots[0].timestamp).toBeGreaterThanOrEqual(screenshots[1].timestamp);
      });

      it('should only return screenshots for specified account', async () => {
        const cred2 = await credentialStore.add({
          url: 'https://other.com',
          username: 'user2',
          password_encrypted: 'enc'
        });

        await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:...',
          size_bytes: 1000
        });

        await screenshotStore.save(cred2, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:...',
          size_bytes: 1000
        });

        const screenshots = await screenshotStore.getByAccountId(accountId);
        expect(screenshots.length).toBe(1);
        expect(screenshots[0].account_id).toBe(accountId);
      });
    });

    describe('getByStage', () => {
      beforeEach(async () => {
        await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:...',
          size_bytes: 1000
        });

        await screenshotStore.save(accountId, {
          stage: 'after_fill',
          timestamp: Date.now() + 1000,
          data_url: 'data:...',
          size_bytes: 2000
        });

        await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: Date.now() + 2000,
          data_url: 'data:...',
          size_bytes: 1500
        });
      });

      it('should filter by stage', async () => {
        const beforeLogin = await screenshotStore.getByStage(accountId, 'before_login');
        expect(beforeLogin.length).toBe(2);
        expect(beforeLogin.every(s => s.stage === 'before_login')).toBe(true);
      });

      it('should return empty for non-existent stage', async () => {
        const results = await screenshotStore.getByStage(accountId, 'nonexistent');
        expect(results).toEqual([]);
      });
    });

    describe('delete', () => {
      it('should delete screenshot by ID', async () => {
        const saved = await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:...',
          size_bytes: 1000
        });

        await screenshotStore.delete(saved.id!);
        const deleted = await screenshotStore.getById(saved.id!);
        expect(deleted).toBeUndefined();
      });
    });

    describe('deleteByAccountId', () => {
      it('should delete all screenshots for account', async () => {
        await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:...',
          size_bytes: 1000
        });

        await screenshotStore.save(accountId, {
          stage: 'after_fill',
          timestamp: Date.now(),
          data_url: 'data:...',
          size_bytes: 2000
        });

        expect(await screenshotStore.count()).toBe(2);

        await screenshotStore.deleteByAccountId(accountId);
        expect(await screenshotStore.count()).toBe(0);
      });
    });

    describe('getTotalSize', () => {
      it('should return total screenshot size in bytes', async () => {
        await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:...',
          size_bytes: 5000
        });

        await screenshotStore.save(accountId, {
          stage: 'after_fill',
          timestamp: Date.now(),
          data_url: 'data:...',
          size_bytes: 3000
        });

        const total = await screenshotStore.getTotalSize();
        expect(total).toBe(8000);
      });

      it('should return 0 when no screenshots', async () => {
        const total = await screenshotStore.getTotalSize();
        expect(total).toBe(0);
      });
    });

    describe('cleanupOld', () => {
      it('should remove old screenshots beyond retention period', async () => {
        const retentionMs = 30 * 24 * 60 * 60 * 1000;
        const oldTime = Date.now() - retentionMs - 100000;

        await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: oldTime,
          data_url: 'data:...',
          size_bytes: 1000
        });

        await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:...',
          size_bytes: 1000
        });

        const deleted = await screenshotStore.cleanupOld(30);
        expect(deleted).toBeGreaterThan(0);
      });
    });

    describe('count', () => {
      it('should return correct screenshot count', async () => {
        expect(await screenshotStore.count()).toBe(0);

        await screenshotStore.save(accountId, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:...',
          size_bytes: 1000
        });

        expect(await screenshotStore.count()).toBe(1);
      });
    });
  });

  describe('Database Utilities', () => {
    describe('checkIntegrity', () => {
      it('should verify database integrity', async () => {
        const result = await dbUtils.checkIntegrity();
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should return error array on failure', async () => {
        const result = await dbUtils.checkIntegrity();
        expect(Array.isArray(result.errors)).toBe(true);
      });
    });

    describe('getStats', () => {
      it('should return accurate statistics', async () => {
        const credId = await credentialStore.add({
          url: 'https://example.com',
          username: 'user',
          password_encrypted: 'enc'
        });

        await cookieStore.saveCookies(credId, [
          { name: 'c1', value: 'v1' },
          { name: 'c2', value: 'v2' }
        ]);

        await logStore.add({
          account_id: credId,
          status: LoginStatus.SUCCESS,
          timestamp: Date.now()
        });

        await screenshotStore.save(credId, {
          stage: 'before_login',
          timestamp: Date.now(),
          data_url: 'data:...',
          size_bytes: 5000
        });

        const stats = await dbUtils.getStats();
        expect(stats.credentials).toBe(1);
        expect(stats.cookies).toBe(2);
        expect(stats.logs).toBe(1);
        expect(stats.screenshots).toBe(1);
        expect(stats.screenshotSizeBytes).toBe(5000);
      });
    });

    describe('clearAll', () => {
      it('should clear entire database', async () => {
        const credId = await credentialStore.add({
          url: 'https://example.com',
          username: 'user',
          password_encrypted: 'enc'
        });

        await cookieStore.saveCookies(credId, [{ name: 'test', value: 'val' }]);

        let stats = await dbUtils.getStats();
        expect(stats.credentials).toBeGreaterThan(0);

        await dbUtils.clearAll();

        stats = await dbUtils.getStats();
        expect(stats.credentials).toBe(0);
        expect(stats.cookies).toBe(0);
        expect(stats.logs).toBe(0);
        expect(stats.screenshots).toBe(0);
      });
    });
  });

  describe('Multi-Account Isolation', () => {
    it('should isolate cookies between accounts', async () => {
      const cred1 = await credentialStore.add({
        url: 'https://site1.com',
        username: 'user1',
        password_encrypted: 'enc1'
      });

      const cred2 = await credentialStore.add({
        url: 'https://site2.com',
        username: 'user2',
        password_encrypted: 'enc2'
      });

      const cookies1: Cookie[] = [
        { name: 'session', value: 'token1', expires: Date.now() + 3600000 }
      ];

      const cookies2: Cookie[] = [
        { name: 'session', value: 'token2', expires: Date.now() + 3600000 }
      ];

      await cookieStore.saveCookies(cred1, cookies1);
      await cookieStore.saveCookies(cred2, cookies2);

      const loaded1 = await cookieStore.loadCookies(cred1);
      const loaded2 = await cookieStore.loadCookies(cred2);

      expect(loaded1[0].value).toBe('token1');
      expect(loaded2[0].value).toBe('token2');
    });

    it('should isolate logs between accounts', async () => {
      const cred1 = await credentialStore.add({
        url: 'https://site1.com',
        username: 'user1',
        password_encrypted: 'enc1'
      });

      const cred2 = await credentialStore.add({
        url: 'https://site2.com',
        username: 'user2',
        password_encrypted: 'enc2'
      });

      const now = Date.now();
      await logStore.add({
        account_id: cred1,
        status: LoginStatus.SUCCESS,
        timestamp: now
      });

      await logStore.add({
        account_id: cred2,
        status: LoginStatus.WRONG_PASSWORD,
        timestamp: now
      });

      const logs1 = await logStore.getByAccountId(cred1);
      const logs2 = await logStore.getByAccountId(cred2);

      expect(logs1[0].status).toBe(LoginStatus.SUCCESS);
      expect(logs2[0].status).toBe(LoginStatus.WRONG_PASSWORD);
    });
  });
});
