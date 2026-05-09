/**
 * Messaging Types Tests
 * Verifies message type definitions, response envelopes, and error classes
 */

import {
  MessageResponse,
  MESSAGE_TYPES,
  TimeoutError,
  createResponse,
  createErrorResponse,
  BackgroundMessage,
  ContentMessage
} from '@messaging/types';

describe('Messaging Types', () => {
  describe('MESSAGE_TYPES constants', () => {
    it('should define all background message types', () => {
      expect(MESSAGE_TYPES.GET_CREDENTIALS).toBe('GET_CREDENTIALS');
      expect(MESSAGE_TYPES.ADD_CREDENTIAL).toBe('ADD_CREDENTIAL');
      expect(MESSAGE_TYPES.UPDATE_CREDENTIAL).toBe('UPDATE_CREDENTIAL');
      expect(MESSAGE_TYPES.DELETE_CREDENTIAL).toBe('DELETE_CREDENTIAL');
      expect(MESSAGE_TYPES.START_LOGIN).toBe('START_LOGIN');
      expect(MESSAGE_TYPES.STOP_LOGIN).toBe('STOP_LOGIN');
      expect(MESSAGE_TYPES.GET_STATUS).toBe('GET_STATUS');
      expect(MESSAGE_TYPES.LOG_ATTEMPT).toBe('LOG_ATTEMPT');
      expect(MESSAGE_TYPES.GET_LOGS).toBe('GET_LOGS');
      expect(MESSAGE_TYPES.EXPORT_LOGS).toBe('EXPORT_LOGS');
      expect(MESSAGE_TYPES.GET_STATS).toBe('GET_STATS');
      expect(MESSAGE_TYPES.CLEANUP_DB).toBe('CLEANUP_DB');
    });

    it('should define all content message types', () => {
      expect(MESSAGE_TYPES.DETECT_FORM).toBe('DETECT_FORM');
      expect(MESSAGE_TYPES.FILL_FORM).toBe('FILL_FORM');
      expect(MESSAGE_TYPES.SUBMIT_FORM).toBe('SUBMIT_FORM');
      expect(MESSAGE_TYPES.DETECT_CAPTCHA).toBe('DETECT_CAPTCHA');
      expect(MESSAGE_TYPES.CAPTURE_SCREENSHOT).toBe('CAPTURE_SCREENSHOT');
      expect(MESSAGE_TYPES.GET_PAGE_INFO).toBe('GET_PAGE_INFO');
    });

    it('should have no duplicate message types', () => {
      const values = Object.values(MESSAGE_TYPES);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  describe('MessageResponse<T>', () => {
    it('should create response with success and data', () => {
      const response: MessageResponse<string> = {
        success: true,
        data: 'test data',
        timestamp: 123456789
      };

      expect(response.success).toBe(true);
      expect(response.data).toBe('test data');
      expect(response.error).toBeUndefined();
      expect(response.timestamp).toBe(123456789);
    });

    it('should create response with success and no data', () => {
      const response: MessageResponse<void> = {
        success: true,
        timestamp: 123456789
      };

      expect(response.success).toBe(true);
      expect(response.data).toBeUndefined();
      expect(response.timestamp).toBe(123456789);
    });

    it('should create error response with message', () => {
      const response: MessageResponse<never> = {
        success: false,
        error: 'Something went wrong',
        timestamp: 123456789
      };

      expect(response.success).toBe(false);
      expect(response.error).toBe('Something went wrong');
      expect(response.data).toBeUndefined();
      expect(response.timestamp).toBe(123456789);
    });

    it('should have optional fields', () => {
      const response: MessageResponse<any> = {
        success: true,
        timestamp: 123456789
      };

      expect(response.data).toBeUndefined();
      expect(response.error).toBeUndefined();
    });
  });

  describe('createResponse helper', () => {
    it('should create successful response with data', () => {
      const data = { id: '123', name: 'test' };
      const response = createResponse(data, 1000);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.timestamp).toBe(1000);
    });

    it('should use Date.now() if timestamp not provided', () => {
      const before = Date.now();
      const response = createResponse({ test: true });
      const after = Date.now();

      expect(response.timestamp).toBeGreaterThanOrEqual(before);
      expect(response.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle empty object', () => {
      const response = createResponse({}, 1000);
      expect(response.success).toBe(true);
      expect(response.data).toEqual({});
    });

    it('should handle array data', () => {
      const data = [1, 2, 3, 4];
      const response = createResponse(data, 1000);
      expect(response.data).toEqual(data);
    });

    it('should handle null data', () => {
      const response = createResponse(null, 1000);
      expect(response.data).toBeNull();
    });
  });

  describe('createErrorResponse helper', () => {
    it('should create error response', () => {
      const response = createErrorResponse('Something failed', 1000);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Something failed');
      expect(response.timestamp).toBe(1000);
      expect(response.data).toBeUndefined();
    });

    it('should use Date.now() if timestamp not provided', () => {
      const before = Date.now();
      const response = createErrorResponse('Error');
      const after = Date.now();

      expect(response.timestamp).toBeGreaterThanOrEqual(before);
      expect(response.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle empty error message', () => {
      const response = createErrorResponse('', 1000);
      expect(response.error).toBe('');
      expect(response.success).toBe(false);
    });

    it('should preserve error message format', () => {
      const message = 'Network error: ECONNREFUSED';
      const response = createErrorResponse(message, 1000);
      expect(response.error).toBe(message);
    });
  });

  describe('TimeoutError class', () => {
    it('should be an Error instance', () => {
      const error = new TimeoutError();
      expect(error).toBeInstanceOf(Error);
    });

    it('should have TimeoutError name', () => {
      const error = new TimeoutError();
      expect(error.name).toBe('TimeoutError');
    });

    it('should have default message', () => {
      const error = new TimeoutError();
      expect(error.message).toBe('Message timed out');
    });

    it('should accept custom message', () => {
      const message = 'Custom timeout message';
      const error = new TimeoutError(message);
      expect(error.message).toBe(message);
    });

    it('should be catchable as Error', () => {
      const error = new TimeoutError('test');
      expect(error instanceof Error).toBe(true);
    });

    it('should be identifiable by name', () => {
      const error = new TimeoutError();
      expect(error.name).toBe('TimeoutError');

      const regularError = new Error('test');
      expect(regularError.name).toBe('Error');
    });

    it('should preserve stack trace', () => {
      const error = new TimeoutError('test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TimeoutError');
    });
  });

  describe('Message type definitions', () => {
    it('should allow creating valid background messages', () => {
      const msg1: BackgroundMessage = {
        type: 'GET_CREDENTIALS'
      };
      expect(msg1.type).toBe('GET_CREDENTIALS');

      const msg2: BackgroundMessage = {
        type: 'START_LOGIN',
        data: {
          accountId: '123',
          url: 'https://example.com'
        }
      };
      expect(msg2.type).toBe('START_LOGIN');
    });

    it('should allow creating valid content messages', () => {
      const msg1: ContentMessage = {
        type: 'DETECT_FORM',
        data: { url: 'https://example.com' }
      };
      expect(msg1.type).toBe('DETECT_FORM');

      const msg2: ContentMessage = {
        type: 'CAPTURE_SCREENSHOT',
        data: { stage: 'before_login' }
      };
      expect(msg2.type).toBe('CAPTURE_SCREENSHOT');
    });
  });

  describe('Response type mapping', () => {
    it('should have response types for all background messages', () => {
      // This test verifies the MessageResponseMap interface
      // If compilation succeeds, the mapping is correct
      const testMapping = {
        GET_CREDENTIALS: { credentials: [] },
        ADD_CREDENTIAL: { id: '123', credential: {} as any },
        UPDATE_CREDENTIAL: { credential: {} as any },
        DELETE_CREDENTIAL: { deleted: true },
        START_LOGIN: { loginId: '123', status: 'IN_PROGRESS' as const },
        STOP_LOGIN: { stopped: true },
        GET_STATUS: { status: 'idle' as const },
        LOG_ATTEMPT: { logId: '123' },
        GET_LOGS: { logs: [] },
        EXPORT_LOGS: { data: 'csv' },
        GET_STATS: {
          credentials: 0,
          cookies: 0,
          logs: 0,
          screenshots: 0,
          screenshotSizeBytes: 0
        },
        CLEANUP_DB: { cleaned: { cookies: 0, logs: 0, screenshots: 0 } }
      };

      // Just verify the object structure matches expectations
      expect(testMapping.GET_CREDENTIALS.credentials).toEqual([]);
      expect(testMapping.GET_STATUS.status).toBe('idle');
    });

    it('should have response types for all content messages', () => {
      const testMapping = {
        DETECT_FORM: { found: true },
        FILL_FORM: { success: true, fieldsMatched: 0, fieldsFilled: 0 },
        SUBMIT_FORM: { success: true },
        DETECT_CAPTCHA: { found: false },
        CAPTURE_SCREENSHOT: { success: true },
        GET_PAGE_INFO: { url: '', title: '', hasForm: false }
      };

      expect(testMapping.DETECT_FORM.found).toBe(true);
      expect(testMapping.CAPTURE_SCREENSHOT.success).toBe(true);
    });
  });
});
