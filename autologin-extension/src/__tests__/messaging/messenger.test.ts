/**
 * Messenger Tests
 * Tests for sendToBackground, sendToContent, and sendToActiveTab
 * Verifies async/await wrapping, timeout handling, and error normalization
 */

import {
  sendToBackground,
  sendToContent,
  sendToActiveTab
} from '@messaging/messenger';
import { TimeoutError, MESSAGE_TYPES } from '@messaging/types';

describe('Messenger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendToBackground', () => {
    it('should send typed message to background', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_message, callback) => {
        callback({ success: true, data: [], timestamp: Date.now() });
      });

      const response = await sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: MESSAGE_TYPES.GET_CREDENTIALS },
        expect.any(Function)
      );
      expect(response.success).toBe(true);
      expect(response.data).toEqual([]);
    });

    it('should return typed response', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_message, callback) => {
        callback({
          success: true,
          data: { credentials: [{ id: '123' }] },
          timestamp: 1000
        });
      });

      const response = await sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS });

      expect(response.success).toBe(true);
      expect(response.timestamp).toBe(1000);
    });

    it('should handle message with data payload', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_message, callback) => {
        callback({ success: true, data: { id: 'log123' }, timestamp: Date.now() });
      });

      const response = await sendToBackground({
        type: MESSAGE_TYPES.LOG_ATTEMPT,
        data: {
          account_id: 'acc1',
          status: 'SUCCESS',
          timestamp: Date.now()
        }
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
      const callArgs = (chrome.runtime.sendMessage as jest.Mock).mock.calls[0][0];
      expect(callArgs.type).toBe(MESSAGE_TYPES.LOG_ATTEMPT);
      expect(callArgs.data.account_id).toBe('acc1');
      expect(response.success).toBe(true);
    });

    it('should timeout if no response within timeoutMs', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation(() => {
        // Never call the callback
      });

      await expect(
        sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS }, 100)
      ).rejects.toThrow(TimeoutError);
    });

    it('should handle timeout with custom message', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation(() => {
        // Never call the callback
      });

      try {
        await sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS }, 50);
        fail('Should have thrown TimeoutError');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        expect((error as Error).message).toContain('GET_CREDENTIALS');
        expect((error as Error).message).toContain('50ms');
      }
    });

    it('should handle chrome.runtime.lastError', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_message, callback) => {
        (chrome.runtime.lastError as any) = { message: 'Extension context invalidated' };
        callback({ success: false });
      });

      await expect(
        sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS })
      ).rejects.toThrow(/Extension context invalidated/);
    });

    it('should handle error response from background', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_message, callback) => {
        callback({ success: false, error: 'Database error', timestamp: Date.now() });
      });

      const response = await sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS });

      expect(response.success).toBe(false);
      expect(response.error).toBe('Database error');
    });

    it('should reject on invalid response format', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_message, callback) => {
        callback('not an object');
      });

      await expect(
        sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS })
      ).rejects.toThrow(/Invalid response/);
    });

    it('should reject on null response', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_message, callback) => {
        callback(null);
      });

      await expect(
        sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS })
      ).rejects.toThrow(/Invalid response/);
    });

    it('should reject on exception in chrome.runtime.sendMessage', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation(() => {
        throw new Error('sendMessage not available');
      });

      await expect(
        sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS })
      ).rejects.toThrow(/sendMessage not available/);
    });

    it('should use default timeout of 5000ms', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation(() => {
        // Never call callback
      });

      const start = Date.now();
      try {
        // Should reject after 5000ms (give it some buffer)
        await sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS });
        fail('Should have timed out');
      } catch (error) {
        const elapsed = Date.now() - start;
        expect(error).toBeInstanceOf(TimeoutError);
        // Allow 500ms variance
        expect(elapsed).toBeGreaterThanOrEqual(4500);
        expect(elapsed).toBeLessThan(6000);
      }
    }, 7000); // Jest timeout
  });

  describe('sendToContent', () => {
    it('should send message to specific tab', async () => {
      (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_tabId, _message, callback) => {
        callback({ success: true, data: { found: true }, timestamp: Date.now() });
      });

      const response = await sendToContent(123, {
        type: MESSAGE_TYPES.DETECT_FORM,
        data: { url: 'https://example.com' }
      });

      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        123,
        expect.objectContaining({ type: MESSAGE_TYPES.DETECT_FORM }),
        expect.any(Function)
      );
      expect(response.success).toBe(true);
    });

    it('should return typed response from content', async () => {
      (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_tabId, _message, callback) => {
        callback({
          success: true,
          data: {
            found: true,
            fields: {
              username_selector: '#user',
              password_selector: '#pass',
              submit_selector: '#btn'
            }
          },
          timestamp: Date.now()
        });
      });

      const response = await sendToContent(456, {
        type: MESSAGE_TYPES.DETECT_FORM,
        data: { url: 'https://test.com' }
      });

      expect(response.success).toBe(true);
      expect(response.data?.found).toBe(true);
    });

    it('should timeout if content script does not respond', async () => {
      (chrome.tabs.sendMessage as jest.Mock).mockImplementation(() => {
        // Never call callback
      });

      await expect(
        sendToContent(789, { type: MESSAGE_TYPES.DETECT_FORM, data: { url: '' } }, 100)
      ).rejects.toThrow(TimeoutError);
    });

    it('should handle chrome.runtime.lastError from content', async () => {
      (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_tabId, _message, callback) => {
        (chrome.runtime.lastError as any) = { message: 'Receiving end does not exist' };
        callback(undefined);
      });

      await expect(
        sendToContent(999, { type: MESSAGE_TYPES.DETECT_FORM, data: { url: '' } })
      ).rejects.toThrow(/Receiving end does not exist/);
    });

    it('should handle error response from content', async () => {
      (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_tabId, _message, callback) => {
        callback({ success: false, error: 'No form found', timestamp: Date.now() });
      });

      const response = await sendToContent(111, {
        type: MESSAGE_TYPES.DETECT_FORM,
        data: { url: 'https://example.com' }
      });

      expect(response.success).toBe(false);
      expect(response.error).toBe('No form found');
    });
  });

  describe('sendToActiveTab', () => {
    it('should query for active tab and send message', async () => {
      (chrome.tabs.query as jest.Mock).mockImplementation((_queryInfo, callback) => {
        callback([{ id: 555, active: true }]);
      });

      (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_tabId, _message, callback) => {
        callback({ success: true, data: { found: false }, timestamp: Date.now() });
      });

      const response = await sendToActiveTab({
        type: MESSAGE_TYPES.DETECT_CAPTCHA,
        data: {}
      });

      expect(chrome.tabs.query).toHaveBeenCalledWith(
        { active: true, currentWindow: true },
        expect.any(Function)
      );
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        555,
        expect.objectContaining({ type: MESSAGE_TYPES.DETECT_CAPTCHA }),
        expect.any(Function)
      );
      expect(response.success).toBe(true);
    });

    it('should reject if no active tab found', async () => {
      (chrome.tabs.query as jest.Mock).mockImplementation((_queryInfo, callback) => {
        callback([]); // Empty array
      });

      await expect(
        sendToActiveTab({ type: MESSAGE_TYPES.DETECT_FORM, data: { url: '' } })
      ).rejects.toThrow(/No active tab found/);
    });

    it('should reject if active tab has no ID', async () => {
      (chrome.tabs.query as jest.Mock).mockImplementation((_queryInfo, callback) => {
        callback([{ active: true }]); // No id field
      });

      await expect(
        sendToActiveTab({ type: MESSAGE_TYPES.DETECT_FORM, data: { url: '' } })
      ).rejects.toThrow(/Active tab has no ID/);
    });

    it('should handle chrome.runtime.lastError from tabs.query', async () => {
      (chrome.tabs.query as jest.Mock).mockImplementation((_queryInfo, callback) => {
        (chrome.runtime.lastError as any) = { message: 'tabs.query failed' };
        callback([]);
      });

      await expect(
        sendToActiveTab({ type: MESSAGE_TYPES.DETECT_FORM, data: { url: '' } })
      ).rejects.toThrow(/tabs.query failed/);
    });

    it('should timeout if content on active tab does not respond', async () => {
      (chrome.tabs.query as jest.Mock).mockImplementation((_queryInfo, callback) => {
        callback([{ id: 666 }]);
      });

      (chrome.tabs.sendMessage as jest.Mock).mockImplementation(() => {
        // Never call callback
      });

      await expect(
        sendToActiveTab({ type: MESSAGE_TYPES.DETECT_FORM, data: { url: '' } }, 100)
      ).rejects.toThrow(TimeoutError);
    });

    it('should pass through sendToContent errors', async () => {
      (chrome.tabs.query as jest.Mock).mockImplementation((_queryInfo, callback) => {
        callback([{ id: 777 }]);
      });

      (chrome.tabs.sendMessage as jest.Mock).mockImplementation((_tabId, _message, callback) => {
        (chrome.runtime.lastError as any) = { message: 'Content script crashed' };
        callback(undefined);
      });

      await expect(
        sendToActiveTab({ type: MESSAGE_TYPES.DETECT_FORM, data: { url: '' } })
      ).rejects.toThrow(/Content script crashed/);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle multiple concurrent messages', async () => {
      let callCount = 0;
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_message, callback) => {
        callCount++;
        callback({
          success: true,
          data: { index: callCount },
          timestamp: Date.now()
        });
      });

      const responses = await Promise.all([
        sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS }),
        sendToBackground({ type: MESSAGE_TYPES.GET_STATUS }),
        sendToBackground({ type: MESSAGE_TYPES.GET_STATS })
      ]);

      expect(responses).toHaveLength(3);
      expect(responses[0].success).toBe(true);
      expect(responses[1].success).toBe(true);
      expect(responses[2].success).toBe(true);
    });

    it('should handle rapid successive messages', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((_message, callback) => {
        setTimeout(() => {
          callback({ success: true, timestamp: Date.now() });
        }, 10);
      });

      const response1 = await sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS });
      const response2 = await sendToBackground({ type: MESSAGE_TYPES.GET_STATUS });

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
    });
  });
});
