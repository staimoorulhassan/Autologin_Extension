/**
 * Task 3: Popup Client Tests
 * Tests for popup UI client communication
 */

import { MessageSystem } from '../../messaging/messageSystem';
import { PopupClient, initializePopupHandlers } from '../../messaging/popupClient';
import type { Credential, Cookie } from '../../types';

describe('Task 3: Popup Client Communication', () => {
  let messageSystem: MessageSystem;
  let popupClient: PopupClient;

  beforeEach(() => {
    messageSystem = new MessageSystem();
    popupClient = new PopupClient(messageSystem);
    initializePopupHandlers(messageSystem);

    // Register mock handlers for background communication
    messageSystem.registerHandler('GET_CREDENTIALS', async () => ({
      credentials: [
        {
          id: '1',
          url: 'https://example.com',
          username: 'user1',
          password: 'pass1',
        },
      ],
    }));

    messageSystem.registerHandler('ADD_CREDENTIAL', async () => ({
      id: 'new-cred-id',
      success: true,
    }));

    messageSystem.registerHandler('UPDATE_CREDENTIAL', async () => ({ success: true }));

    messageSystem.registerHandler('DELETE_CREDENTIAL', async () => ({ success: true }));

    messageSystem.registerHandler('LOGIN_REQUEST', async () => ({}));

    messageSystem.registerHandler('GET_LOGS', async () => ({
      logs: [{ id: 'log-1', account_id: 'cred-1', timestamp: Date.now(), status: 'SUCCESS' }],
    }));

    messageSystem.registerHandler('EXPORT_LOGS', async () => ({
      csv: 'timestamp,account_id,status\n123456,cred-1,SUCCESS',
    }));

    messageSystem.registerHandler('SAVE_COOKIES', async () => ({ count: 1 }));

    messageSystem.registerHandler('LOAD_COOKIES', async () => ({
      cookies: [
        {
          account_id: 'cred-1',
          name: 'session',
          value: 'abc123',
          domain: 'example.com',
          path: '/',
        },
      ],
    }));

    messageSystem.registerHandler('PING', async () => 'PONG');
  });

  describe('Credential operations', () => {
    test('should retrieve all credentials', async () => {
      const credentials = await popupClient.getCredentials();

      expect(credentials).toHaveLength(1);
      expect(credentials[0].url).toBe('https://example.com');
    });

    test('should add new credential', async () => {
      const newCredential: Credential = {
        url: 'https://newsite.com',
        username: 'newuser',
        password: 'newpass',
      };

      const id = await popupClient.addCredential(newCredential);

      expect(id).toBe('new-cred-id');
    });

    test('should update credential', async () => {
      const updates = { username: 'updated_user' };
      await popupClient.updateCredential('cred-1', updates);
      // If no error thrown, success
      expect(true).toBe(true);
    });

    test('should delete credential', async () => {
      await popupClient.deleteCredential('cred-1');
      // If no error thrown, success
      expect(true).toBe(true);
    });
  });

  describe('Login operations', () => {
    test('should start login for account', async () => {
      await popupClient.startLogin('cred-1');
      // If no error thrown, success
      expect(true).toBe(true);
    });
  });

  describe('History and logging', () => {
    test('should retrieve login history for account', async () => {
      const history = await popupClient.getLoginHistory('cred-1');

      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('SUCCESS');
    });

    test('should retrieve login history with limit', async () => {
      const history = await popupClient.getLoginHistory('cred-1', 5);

      expect(Array.isArray(history)).toBe(true);
    });

    test('should export logs as CSV', async () => {
      const csv = await popupClient.exportLogs();

      expect(csv).toContain('timestamp');
      expect(csv).toContain('account_id');
      expect(csv).toContain('status');
    });
  });

  describe('Cookie operations', () => {
    test('should save cookies for account', async () => {
      const cookies: Cookie[] = [
        {
          account_id: 'cred-1',
          name: 'session',
          value: 'xyz789',
          domain: 'example.com',
          path: '/',
        },
      ];

      const count = await popupClient.saveCookies('cred-1', cookies);

      expect(count).toBe(1);
    });

    test('should load cookies for account', async () => {
      const cookies = await popupClient.loadCookies('cred-1');

      expect(cookies).toHaveLength(1);
      expect(cookies[0].name).toBe('session');
    });
  });

  describe('Connection testing', () => {
    test('should ping background worker', async () => {
      const alive = await popupClient.ping();

      expect(alive).toBe(true);
    });

    test('should return false when background is unreachable', async () => {
      const slowSystem = new MessageSystem({ timeout: 100 });
      const slowClient = new PopupClient(slowSystem);

      // Don't register PING handler, so it throws "No handler registered"
      const alive = await slowClient.ping();

      expect(alive).toBe(false);
    });
  });

  describe('Popup handlers', () => {
    test('should handle STATUS_UPDATE from background', async () => {
      const result = await messageSystem.send('STATUS_UPDATE', {
        status: 'processing',
        message: 'Login in progress',
      });

      expect(result).toEqual({ acknowledged: true });
    });

    test('should handle LOGIN_PROGRESS from background', async () => {
      const result = await messageSystem.send('LOGIN_PROGRESS', {
        accountId: 'cred-1',
        stage: 'filling_form',
        progress: 50,
      });

      expect(result).toEqual({ acknowledged: true });
    });

    test('should handle ERROR_NOTIFICATION from background', async () => {
      const result = await messageSystem.send('ERROR_NOTIFICATION', {
        error: 'Login failed',
        accountId: 'cred-1',
      });

      expect(result).toEqual({ acknowledged: true });
    });
  });
});
