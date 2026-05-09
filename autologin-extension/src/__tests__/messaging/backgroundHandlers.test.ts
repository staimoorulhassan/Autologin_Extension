/**
 * Task 3: Background Handlers Tests
 * Tests for background worker message handlers
 */

import { MessageSystem } from '../../messaging/messageSystem';
import { initializeBackgroundHandlers } from '../../messaging/backgroundHandlers';
import { credentialStore, logStore, cookieStore } from '../../store/database';
import type { Credential } from '../../types';

// Mock the database stores
jest.mock('@store/database', () => ({
  credentialStore: {
    getAll: jest.fn(),
    getById: jest.fn(),
    add: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  logStore: {
    add: jest.fn(),
    getByAccountId: jest.fn(),
    exportAsCSV: jest.fn(),
  },
  cookieStore: {
    saveCookies: jest.fn(),
    loadCookies: jest.fn(),
  },
}));

describe('Task 3: Background Worker Handlers', () => {
  let messageSystem: MessageSystem;

  beforeEach(() => {
    messageSystem = new MessageSystem();
    initializeBackgroundHandlers(messageSystem);
    jest.clearAllMocks();
  });

  describe('Credential operation handlers', () => {
    test('should handle GET_CREDENTIALS request', async () => {
      const mockCredentials: Credential[] = [
        {
          id: '1',
          url: 'https://example.com',
          username: 'user1',
          password: 'pass1',
        },
      ];

      (credentialStore.getAll as jest.Mock).mockResolvedValue(mockCredentials);

      const result = await messageSystem.send('GET_CREDENTIALS', {});

      expect(credentialStore.getAll).toHaveBeenCalled();
      expect(result).toEqual({ credentials: mockCredentials });
    });

    test('should handle ADD_CREDENTIAL request', async () => {
      const newCredential: Credential = {
        url: 'https://example.com',
        username: 'newuser',
        password: 'newpass',
      };

      (credentialStore.add as jest.Mock).mockResolvedValue('cred-123');

      const result = await messageSystem.send('ADD_CREDENTIAL', newCredential);

      expect(credentialStore.add).toHaveBeenCalledWith(newCredential);
      expect(result).toEqual({ id: 'cred-123', success: true });
    });

    test('should handle UPDATE_CREDENTIAL request', async () => {
      const updates = { username: 'updated_user' };

      (credentialStore.update as jest.Mock).mockResolvedValue(undefined);

      const result = await messageSystem.send('UPDATE_CREDENTIAL', {
        id: 'cred-123',
        updates,
      });

      expect(credentialStore.update).toHaveBeenCalledWith('cred-123', updates);
      expect(result).toEqual({ success: true });
    });

    test('should handle DELETE_CREDENTIAL request', async () => {
      (credentialStore.delete as jest.Mock).mockResolvedValue(undefined);

      const result = await messageSystem.send('DELETE_CREDENTIAL', {
        id: 'cred-123',
      });

      expect(credentialStore.delete).toHaveBeenCalledWith('cred-123');
      expect(result).toEqual({ success: true });
    });
  });

  describe('Login operation handlers', () => {
    test('should handle LOGIN_REQUEST with valid credential', async () => {
      const credential: Credential = {
        id: 'cred-123',
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      (credentialStore.getById as jest.Mock).mockResolvedValue(credential);

      const result = await messageSystem.send('LOGIN_REQUEST', { accountId: 'cred-123' });

      expect(credentialStore.getById).toHaveBeenCalledWith('cred-123');
      expect(result).toEqual({ credential });
    });

    test('should reject LOGIN_REQUEST with invalid credential ID', async () => {
      (credentialStore.getById as jest.Mock).mockResolvedValue(null);

      await expect(messageSystem.send('LOGIN_REQUEST', { accountId: 'invalid' })).rejects.toThrow(
        'Credential not found: invalid'
      );
    });

    test('should handle LOGIN_STATUS request', async () => {
      const loginLog = {
        account_id: 'cred-123',
        timestamp: Date.now(),
        status: 'SUCCESS' as const,
      };

      (logStore.add as jest.Mock).mockResolvedValue('log-456');

      const result = await messageSystem.send('LOGIN_STATUS', loginLog);

      expect(logStore.add).toHaveBeenCalledWith(loginLog);
      expect(result).toEqual({ id: 'log-456', success: true });
    });
  });

  describe('Cookie operation handlers', () => {
    test('should handle SAVE_COOKIES request', async () => {
      const cookies = [
        {
          account_id: 'cred-123',
          name: 'session_id',
          value: 'abc123',
          domain: 'example.com',
          path: '/',
        },
      ];

      (cookieStore.saveCookies as jest.Mock).mockResolvedValue(undefined);

      const result = await messageSystem.send('SAVE_COOKIES', {
        accountId: 'cred-123',
        cookies,
      });

      expect(cookieStore.saveCookies).toHaveBeenCalledWith('cred-123', cookies);
      expect(result).toEqual({ success: true, count: 1 });
    });

    test('should handle LOAD_COOKIES request', async () => {
      const cookies = [
        {
          account_id: 'cred-123',
          name: 'session_id',
          value: 'abc123',
          domain: 'example.com',
          path: '/',
        },
      ];

      (cookieStore.loadCookies as jest.Mock).mockResolvedValue(cookies);

      const result = await messageSystem.send('LOAD_COOKIES', { accountId: 'cred-123' });

      expect(cookieStore.loadCookies).toHaveBeenCalledWith('cred-123');
      expect(result).toEqual({ cookies });
    });
  });

  describe('Logging operation handlers', () => {
    test('should handle LOG_EVENT request', async () => {
      const logEvent = {
        account_id: 'cred-123',
        timestamp: Date.now(),
        status: 'SUCCESS' as const,
      };

      (logStore.add as jest.Mock).mockResolvedValue('log-789');

      const result = await messageSystem.send('LOG_EVENT', logEvent);

      expect(logStore.add).toHaveBeenCalledWith(logEvent);
      expect(result).toEqual({ id: 'log-789', success: true });
    });

    test('should handle GET_LOGS request', async () => {
      const logs = [
        {
          id: 'log-1',
          account_id: 'cred-123',
          timestamp: Date.now(),
          status: 'SUCCESS' as const,
        },
      ];

      (logStore.getByAccountId as jest.Mock).mockResolvedValue(logs);

      const result = await messageSystem.send('GET_LOGS', { accountId: 'cred-123', limit: 10 });

      expect(logStore.getByAccountId).toHaveBeenCalledWith('cred-123', 10);
      expect(result).toEqual({ logs });
    });

    test('should handle EXPORT_LOGS request', async () => {
      const csv = 'timestamp,account_id,status\n123456,cred-123,SUCCESS';

      (logStore.exportAsCSV as jest.Mock).mockResolvedValue(csv);

      const result = await messageSystem.send('EXPORT_LOGS', {});

      expect(logStore.exportAsCSV).toHaveBeenCalled();
      expect(result).toEqual({ csv });
    });
  });

  describe('Handler registration verification', () => {
    test('should have all credential handlers registered', () => {
      expect(messageSystem.hasHandler('GET_CREDENTIALS')).toBe(true);
      expect(messageSystem.hasHandler('ADD_CREDENTIAL')).toBe(true);
      expect(messageSystem.hasHandler('UPDATE_CREDENTIAL')).toBe(true);
      expect(messageSystem.hasHandler('DELETE_CREDENTIAL')).toBe(true);
    });

    test('should have all login handlers registered', () => {
      expect(messageSystem.hasHandler('LOGIN_REQUEST')).toBe(true);
      expect(messageSystem.hasHandler('LOGIN_STATUS')).toBe(true);
    });

    test('should have all cookie handlers registered', () => {
      expect(messageSystem.hasHandler('SAVE_COOKIES')).toBe(true);
      expect(messageSystem.hasHandler('LOAD_COOKIES')).toBe(true);
    });

    test('should have all logging handlers registered', () => {
      expect(messageSystem.hasHandler('LOG_EVENT')).toBe(true);
      expect(messageSystem.hasHandler('GET_LOGS')).toBe(true);
      expect(messageSystem.hasHandler('EXPORT_LOGS')).toBe(true);
    });
  });
});
