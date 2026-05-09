/**
 * Handlers Tests
 * Tests for message handler registry, dispatch logic, and error handling
 */

import {
  registerHandler,
  dispatchMessage,
  clearHandlers,
  getHandler,
  getRegisteredTypes
} from '@messaging/handlers';
import { MESSAGE_TYPES, createResponse } from '@messaging/types';

describe('Message Handlers', () => {
  beforeEach(() => {
    clearHandlers();
    jest.clearAllMocks();
  });

  describe('registerHandler', () => {
    it('should register a handler for a message type', () => {
      const mockHandler = jest.fn().mockResolvedValue(
        createResponse({ success: true })
      );

      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, mockHandler);

      const handler = getHandler(MESSAGE_TYPES.GET_CREDENTIALS);
      expect(handler).toBe(mockHandler);
    });

    it('should overwrite existing handler', () => {
      const handler1 = jest.fn().mockResolvedValue(createResponse({ test: 1 }));
      const handler2 = jest.fn().mockResolvedValue(createResponse({ test: 2 }));

      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, handler1);
      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, handler2);

      const registered = getHandler(MESSAGE_TYPES.GET_CREDENTIALS);
      expect(registered).toBe(handler2);
    });

    it('should support registering multiple handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, handler1);
      registerHandler(MESSAGE_TYPES.GET_STATS, handler2);
      registerHandler(MESSAGE_TYPES.DETECT_FORM, handler3);

      expect(getHandler(MESSAGE_TYPES.GET_CREDENTIALS)).toBe(handler1);
      expect(getHandler(MESSAGE_TYPES.GET_STATS)).toBe(handler2);
      expect(getHandler(MESSAGE_TYPES.DETECT_FORM)).toBe(handler3);
    });
  });

  describe('clearHandlers', () => {
    it('should remove all registered handlers', () => {
      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, jest.fn());
      registerHandler(MESSAGE_TYPES.GET_STATS, jest.fn());

      clearHandlers();

      expect(getRegisteredTypes()).toHaveLength(0);
    });
  });

  describe('getRegisteredTypes', () => {
    it('should return empty array initially', () => {
      expect(getRegisteredTypes()).toEqual([]);
    });

    it('should return all registered message types', () => {
      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, jest.fn());
      registerHandler(MESSAGE_TYPES.GET_STATS, jest.fn());
      registerHandler(MESSAGE_TYPES.DETECT_FORM, jest.fn());

      const types = getRegisteredTypes();
      expect(types).toContain(MESSAGE_TYPES.GET_CREDENTIALS);
      expect(types).toContain(MESSAGE_TYPES.GET_STATS);
      expect(types).toContain(MESSAGE_TYPES.DETECT_FORM);
      expect(types).toHaveLength(3);
    });
  });

  describe('dispatchMessage', () => {
    it('should dispatch to registered handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue(
        createResponse({ credentials: [] })
      );
      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, mockHandler);

      const sendResponse = jest.fn();
      const returnValue = dispatchMessage(
        { type: MESSAGE_TYPES.GET_CREDENTIALS },
        {} as any,
        sendResponse
      );

      // Should return true for async response
      expect(returnValue).toBe(true);

      // Wait for promise resolution
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockHandler).toHaveBeenCalledWith(undefined, {});
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should pass message data to handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue(
        createResponse({ logId: '123' })
      );
      registerHandler(MESSAGE_TYPES.LOG_ATTEMPT, mockHandler);

      const messageData = {
        account_id: 'acc1',
        status: 'SUCCESS',
        timestamp: 1000
      };

      const sendResponse = jest.fn();
      dispatchMessage(
        { type: MESSAGE_TYPES.LOG_ATTEMPT, data: messageData },
        {} as any,
        sendResponse
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockHandler).toHaveBeenCalledWith(messageData, {});
    });

    it('should pass sender info to handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue(createResponse({}));
      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, mockHandler);

      const senderInfo: chrome.runtime.MessageSender = {
        tab: { id: 123, url: 'https://example.com' }
      };

      const sendResponse = jest.fn();
      dispatchMessage(
        { type: MESSAGE_TYPES.GET_CREDENTIALS },
        senderInfo,
        sendResponse
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockHandler).toHaveBeenCalledWith(undefined, senderInfo);
    });

    it('should return error for unknown message type', async () => {
      const sendResponse = jest.fn();
      const returnValue = dispatchMessage(
        { type: 'UNKNOWN_TYPE' },
        {} as any,
        sendResponse
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(returnValue).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('UNKNOWN_TYPE')
        })
      );
    });

    it('should return error if message has no type', async () => {
      const sendResponse = jest.fn();
      const returnValue = dispatchMessage(
        { data: 'something' },
        {} as any,
        sendResponse
      );

      // Should return false for sync error response
      expect(returnValue).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('type')
        })
      );
    });

    it('should return error if message is null', async () => {
      const sendResponse = jest.fn();
      const returnValue = dispatchMessage(null, {} as any, sendResponse);

      expect(returnValue).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('should handle handler that throws error', async () => {
      const mockHandler = jest.fn().mockRejectedValue(
        new Error('Database connection failed')
      );
      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, mockHandler);

      const sendResponse = jest.fn();
      dispatchMessage(
        { type: MESSAGE_TYPES.GET_CREDENTIALS },
        {} as any,
        sendResponse
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Database connection failed')
        })
      );
    });

    it('should handle handler that returns invalid response', async () => {
      const mockHandler = jest.fn().mockResolvedValue('invalid');
      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, mockHandler);

      const sendResponse = jest.fn();
      dispatchMessage(
        { type: MESSAGE_TYPES.GET_CREDENTIALS },
        {} as any,
        sendResponse
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('invalid response')
        })
      );
    });

    it('should use response timestamp', async () => {
      const mockHandler = jest.fn().mockResolvedValue(
        createResponse({ test: true }, 9999)
      );
      registerHandler(MESSAGE_TYPES.GET_STATUS, mockHandler);

      const sendResponse = jest.fn();
      dispatchMessage(
        { type: MESSAGE_TYPES.GET_STATUS },
        {} as any,
        sendResponse
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ timestamp: 9999 })
      );
    });

    it('should handle synchronous handler response', async () => {
      // Handler that returns synchronously (not a Promise)
      const mockHandler = jest.fn().mockReturnValue(
        createResponse({ sync: true })
      );
      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, mockHandler);

      const sendResponse = jest.fn();
      dispatchMessage(
        { type: MESSAGE_TYPES.GET_CREDENTIALS },
        {} as any,
        sendResponse
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should handle handler that returns undefined', async () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, mockHandler);

      const sendResponse = jest.fn();
      dispatchMessage(
        { type: MESSAGE_TYPES.GET_CREDENTIALS },
        {} as any,
        sendResponse
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('invalid response')
        })
      );
    });

    it('should always return true (async response)', () => {
      const mockHandler = jest.fn().mockResolvedValue(createResponse({}));
      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, mockHandler);

      const sendResponse = jest.fn();
      const result = dispatchMessage(
        { type: MESSAGE_TYPES.GET_CREDENTIALS },
        {} as any,
        sendResponse
      );

      expect(result).toBe(true);
    });
  });

  describe('Handler execution patterns', () => {
    it('should handle multiple handlers for different message types', async () => {
      const handler1 = jest.fn().mockResolvedValue(
        createResponse({ credentials: [] })
      );
      const handler2 = jest.fn().mockResolvedValue(
        createResponse({ stats: {} })
      );

      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, handler1);
      registerHandler(MESSAGE_TYPES.GET_STATS, handler2);

      const sendResponse1 = jest.fn();
      const sendResponse2 = jest.fn();

      dispatchMessage(
        { type: MESSAGE_TYPES.GET_CREDENTIALS },
        {} as any,
        sendResponse1
      );
      dispatchMessage(
        { type: MESSAGE_TYPES.GET_STATS },
        {} as any,
        sendResponse2
      );

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(sendResponse1).toHaveBeenCalled();
      expect(sendResponse2).toHaveBeenCalled();
    });

    it('should isolate handler failures', async () => {
      const handler1 = jest.fn().mockRejectedValue(new Error('Error in handler 1'));
      const handler2 = jest.fn().mockResolvedValue(
        createResponse({ test: true })
      );

      registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, handler1);
      registerHandler(MESSAGE_TYPES.GET_STATUS, handler2);

      const sendResponse1 = jest.fn();
      const sendResponse2 = jest.fn();

      dispatchMessage(
        { type: MESSAGE_TYPES.GET_CREDENTIALS },
        {} as any,
        sendResponse1
      );
      dispatchMessage(
        { type: MESSAGE_TYPES.GET_STATUS },
        {} as any,
        sendResponse2
      );

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(sendResponse1).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
      expect(sendResponse2).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should handle complex handler data flow', async () => {
      const mockHandler = jest.fn().mockImplementation(async (data) => {
        // Simulate async handler logic
        await new Promise(resolve => setTimeout(resolve, 5));
        return createResponse({
          processed: data?.accountId ? `processed-${data.accountId}` : 'no-account'
        });
      });

      registerHandler(MESSAGE_TYPES.DETECT_FORM, mockHandler);

      const sendResponse = jest.fn();
      dispatchMessage(
        {
          type: MESSAGE_TYPES.DETECT_FORM,
          data: { url: 'https://test.com', accountId: 'acc123' }
        },
        {} as any,
        sendResponse
      );

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { processed: 'processed-acc123' }
        })
      );
    });
  });
});
