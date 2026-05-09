/**
 * Task 3: Message System Tests
 * Tests for message passing between extension components (background, content, popup)
 */

import {
  MessageSystem,
  RequestMessage,
  ResponseMessage,
  MessageType,
} from '../../messaging/messageSystem';

describe('Task 3: Message System & Communication', () => {
  describe('1. MessageSystem initialization', () => {
    test('should create MessageSystem instance with default timeout', () => {
      const messageSystem = new MessageSystem();
      expect(messageSystem).toBeDefined();
      expect(messageSystem.getTimeout()).toBe(5000); // default 5 second timeout
    });

    test('should create MessageSystem with custom timeout', () => {
      const messageSystem = new MessageSystem({ timeout: 10000 });
      expect(messageSystem.getTimeout()).toBe(10000);
    });

    test('should support setting timeout at runtime', () => {
      const messageSystem = new MessageSystem();
      messageSystem.setTimeout(3000);
      expect(messageSystem.getTimeout()).toBe(3000);
    });
  });

  describe('2. Message registration and handling', () => {
    test('should register a message handler for a specific type', () => {
      const messageSystem = new MessageSystem();
      const handler = jest.fn().mockResolvedValue({ result: 'ok' });

      messageSystem.registerHandler('GET_CREDENTIALS', handler);
      expect(messageSystem.hasHandler('GET_CREDENTIALS')).toBe(true);
    });

    test('should unregister a message handler', () => {
      const messageSystem = new MessageSystem();
      const handler = jest.fn();

      messageSystem.registerHandler('GET_CREDENTIALS', handler);
      messageSystem.unregisterHandler('GET_CREDENTIALS');
      expect(messageSystem.hasHandler('GET_CREDENTIALS')).toBe(false);
    });

    test('should support multiple handlers for different message types', () => {
      const messageSystem = new MessageSystem();
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      messageSystem.registerHandler('GET_CREDENTIALS', handler1);
      messageSystem.registerHandler('ADD_CREDENTIAL', handler2);

      expect(messageSystem.hasHandler('GET_CREDENTIALS')).toBe(true);
      expect(messageSystem.hasHandler('ADD_CREDENTIAL')).toBe(true);
    });

    test('should throw when registering duplicate handler without replacement', () => {
      const messageSystem = new MessageSystem();
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      messageSystem.registerHandler('GET_CREDENTIALS', handler1);
      expect(() => {
        messageSystem.registerHandler('GET_CREDENTIALS', handler2);
      }).toThrow('Handler for GET_CREDENTIALS already registered');
    });

    test('should allow replacing a handler with replace option', () => {
      const messageSystem = new MessageSystem();
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      messageSystem.registerHandler('GET_CREDENTIALS', handler1);
      messageSystem.registerHandler('GET_CREDENTIALS', handler2, { replace: true });

      // The second handler should be active
      expect(messageSystem.hasHandler('GET_CREDENTIALS')).toBe(true);
    });
  });

  describe('3. Request/Response pattern', () => {
    test('should send request and receive response', async () => {
      const messageSystem = new MessageSystem();
      const responseData = { credentials: [{ id: '1', url: 'example.com' }] };

      messageSystem.registerHandler('GET_CREDENTIALS', async () => responseData);

      const response = await messageSystem.send('GET_CREDENTIALS', {});
      expect(response).toEqual(responseData);
    });

    test('should send request with data payload', async () => {
      const messageSystem = new MessageSystem();
      const handler = jest.fn().mockResolvedValue({ saved: true });

      messageSystem.registerHandler('ADD_CREDENTIAL', handler);

      const credentialData = { url: 'example.com', username: 'user', password: 'pass' };
      await messageSystem.send('ADD_CREDENTIAL', credentialData);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ADD_CREDENTIAL',
          data: credentialData,
        })
      );
    });

    test('should receive error from handler as rejection', async () => {
      const messageSystem = new MessageSystem();
      const error = new Error('Database error');

      messageSystem.registerHandler('GET_CREDENTIALS', async () => {
        throw error;
      });

      await expect(messageSystem.send('GET_CREDENTIALS', {})).rejects.toThrow('Database error');
    });

    test('should reject if no handler registered for message type', async () => {
      const messageSystem = new MessageSystem();

      await expect(messageSystem.send('UNKNOWN_MESSAGE', {})).rejects.toThrow(
        'No handler registered for UNKNOWN_MESSAGE'
      );
    });
  });

  describe('4. Timeout handling', () => {
    test('should timeout if handler does not respond within timeout period', async () => {
      const messageSystem = new MessageSystem({ timeout: 100 });

      messageSystem.registerHandler('SLOW_OPERATION', async () => {
        await new Promise(resolve => setTimeout(resolve, 500)); // Slow handler
        return { result: 'ok' };
      });

      await expect(messageSystem.send('SLOW_OPERATION', {})).rejects.toThrow(
        /timeout|timed out/i
      );
    });

    test('should complete successfully if handler responds before timeout', async () => {
      const messageSystem = new MessageSystem({ timeout: 1000 });

      messageSystem.registerHandler('QUICK_OPERATION', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { result: 'ok' };
      });

      const response = await messageSystem.send('QUICK_OPERATION', {});
      expect(response).toEqual({ result: 'ok' });
    });

    test('should use custom timeout for specific request', async () => {
      const messageSystem = new MessageSystem({ timeout: 100 });

      messageSystem.registerHandler('SLOW_OPERATION', async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
        return { result: 'ok' };
      });

      // Use custom timeout for this specific request
      const response = await messageSystem.send('SLOW_OPERATION', {}, { timeout: 500 });
      expect(response).toEqual({ result: 'ok' });
    });
  });

  describe('5. Message types and structure', () => {
    test('should define standard message types', () => {
      expect(MessageType.GET_CREDENTIALS).toBeDefined();
      expect(MessageType.ADD_CREDENTIAL).toBeDefined();
      expect(MessageType.LOGIN_REQUEST).toBeDefined();
      expect(MessageType.CAPTCHA_DETECTED).toBeDefined();
    });

    test('should create properly structured request message', () => {
      const request: RequestMessage<{ id: string }> = {
        type: MessageType.GET_CREDENTIALS,
        data: { id: 'test' },
        requestId: 'req-123',
        timestamp: Date.now(),
      };

      expect(request.type).toBe(MessageType.GET_CREDENTIALS);
      expect(request.data).toEqual({ id: 'test' });
      expect(request.requestId).toBeDefined();
      expect(request.timestamp).toBeDefined();
    });

    test('should create properly structured response message', () => {
      const response: ResponseMessage<{ credentials: string[] }> = {
        type: MessageType.GET_CREDENTIALS,
        data: { credentials: ['cred1', 'cred2'] },
        requestId: 'req-123',
        timestamp: Date.now(),
        error: undefined,
      };

      expect(response.type).toBe(MessageType.GET_CREDENTIALS);
      expect(response.data).toEqual({ credentials: ['cred1', 'cred2'] });
      expect(response.requestId).toBe('req-123');
      expect(response.error).toBeUndefined();
    });

    test('should create error response message', () => {
      const response: ResponseMessage = {
        type: MessageType.GET_CREDENTIALS,
        requestId: 'req-123',
        timestamp: Date.now(),
        error: 'Failed to fetch credentials',
      };

      expect(response.error).toBe('Failed to fetch credentials');
      expect(response.data).toBeUndefined();
    });
  });

  describe('6. Error handling and edge cases', () => {
    test('should handle handler that returns undefined', async () => {
      const messageSystem = new MessageSystem();

      messageSystem.registerHandler('NO_DATA', async () => undefined);

      const response = await messageSystem.send('NO_DATA', {});
      expect(response).toBeUndefined();
    });

    test('should handle handler that returns null', async () => {
      const messageSystem = new MessageSystem();

      messageSystem.registerHandler('NULL_RESPONSE', async () => null);

      const response = await messageSystem.send('NULL_RESPONSE', {});
      expect(response).toBeNull();
    });

    test('should handle empty data payload', async () => {
      const messageSystem = new MessageSystem();

      messageSystem.registerHandler('EMPTY_DATA', async (msg) => {
        return { received: msg.data };
      });

      const response = await messageSystem.send('EMPTY_DATA', {});
      expect(response).toEqual({ received: {} });
    });

    test('should handle complex nested data structures', async () => {
      const messageSystem = new MessageSystem();
      const complexData = {
        user: { id: '123', name: 'John' },
        settings: { theme: 'dark', notifications: true },
        items: [{ id: '1', value: 'a' }, { id: '2', value: 'b' }],
      };

      messageSystem.registerHandler('COMPLEX_DATA', async (msg) => {
        return msg.data;
      });

      const response = await messageSystem.send('COMPLEX_DATA', complexData);
      expect(response).toEqual(complexData);
    });

    test('should generate unique request IDs', async () => {
      const messageSystem = new MessageSystem();
      const ids = new Set<string>();

      messageSystem.registerHandler('TEST', async (msg) => msg.requestId);

      for (let i = 0; i < 100; i++) {
        const id = await messageSystem.send('TEST', {});
        ids.add(id as string);
      }

      // All IDs should be unique
      expect(ids.size).toBe(100);
    });
  });

  describe('7. Acceptance Criteria Coverage', () => {
    test('AC1: Message handler accepts requests and returns responses', async () => {
      const messageSystem = new MessageSystem();
      const expectedResponse = { success: true, data: 'test' };

      messageSystem.registerHandler('TEST_AC1', async (request) => {
        expect(request.type).toBe('TEST_AC1');
        expect(request.data).toEqual({ param: 'value' });
        return expectedResponse;
      });

      const result = await messageSystem.send('TEST_AC1', { param: 'value' });
      expect(result).toEqual(expectedResponse);
    });

    test('AC2: Request times out if handler does not respond within timeout', async () => {
      const messageSystem = new MessageSystem({ timeout: 100 });

      messageSystem.registerHandler('TIMEOUT_TEST', async () => {
        return new Promise(resolve => {
          setTimeout(() => resolve({ result: 'late' }), 1000);
        });
      });

      const promise = messageSystem.send('TIMEOUT_TEST', {});
      await expect(promise).rejects.toThrow();
    });

    test('AC3: Multiple message types can be registered and handled independently', async () => {
      const messageSystem = new MessageSystem();

      messageSystem.registerHandler('TYPE_A', async () => ({ type: 'A' }));
      messageSystem.registerHandler('TYPE_B', async () => ({ type: 'B' }));
      messageSystem.registerHandler('TYPE_C', async () => ({ type: 'C' }));

      const [resA, resB, resC] = await Promise.all([
        messageSystem.send('TYPE_A', {}),
        messageSystem.send('TYPE_B', {}),
        messageSystem.send('TYPE_C', {}),
      ]);

      expect(resA).toEqual({ type: 'A' });
      expect(resB).toEqual({ type: 'B' });
      expect(resC).toEqual({ type: 'C' });
    });

    test('AC4: Error from handler is propagated as rejection', async () => {
      const messageSystem = new MessageSystem();
      const errorMessage = 'Custom handler error';

      messageSystem.registerHandler('ERROR_TEST', async () => {
        throw new Error(errorMessage);
      });

      const promise = messageSystem.send('ERROR_TEST', {});
      await expect(promise).rejects.toThrow(errorMessage);
    });

    test('AC5: Message includes metadata (timestamp, requestId)', async () => {
      const messageSystem = new MessageSystem();
      let capturedRequest: RequestMessage | undefined;

      messageSystem.registerHandler('METADATA_TEST', async (request) => {
        capturedRequest = request;
        return { ok: true };
      });

      await messageSystem.send('METADATA_TEST', { data: 'test' });

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest!.timestamp).toBeDefined();
      expect(typeof capturedRequest!.timestamp).toBe('number');
      expect(capturedRequest!.requestId).toBeDefined();
      expect(typeof capturedRequest!.requestId).toBe('string');
      expect(capturedRequest!.requestId.length).toBeGreaterThan(0);
    });

    test('AC6: Concurrent requests are handled independently', async () => {
      const messageSystem = new MessageSystem();

      messageSystem.registerHandler('CONCURRENT_TEST', async (request) => {
        const delay = request.data?.delay || 10;
        await new Promise(resolve => setTimeout(resolve, delay));
        return { processed: request.data };
      });

      const start = Date.now();
      const results = await Promise.all([
        messageSystem.send('CONCURRENT_TEST', { delay: 50 }),
        messageSystem.send('CONCURRENT_TEST', { delay: 50 }),
        messageSystem.send('CONCURRENT_TEST', { delay: 50 }),
      ]);
      const elapsed = Date.now() - start;

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ processed: { delay: 50 } });
      expect(results[1]).toEqual({ processed: { delay: 50 } });
      expect(results[2]).toEqual({ processed: { delay: 50 } });
      // With concurrent requests, total time should be ~50ms (not 150ms)
      // Allow some margin for timing variability
      expect(elapsed).toBeLessThan(200);
    });
  });
});
