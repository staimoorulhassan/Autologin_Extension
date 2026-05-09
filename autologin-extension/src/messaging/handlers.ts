/**
 * Message Handlers
 * Provides a handler registry pattern for background service worker
 * Decouples routing logic from handler implementation
 */

import {
  BackgroundMessage,
  ContentMessage,
  MessageResponse,
  createErrorResponse
} from './types';

/**
 * Type for a handler function
 * Returns either a MessageResponse directly or a Promise of MessageResponse
 */
export type HandlerFn<T extends BackgroundMessage | ContentMessage, R = any> = (
  data: T extends { data: infer D } ? D : undefined,
  sender: chrome.runtime.MessageSender
) => Promise<MessageResponse<R>> | MessageResponse<R>;

/**
 * Handler registry: maps message types to handler functions
 */
const handlers = new Map<string, HandlerFn<any, any>>();

/**
 * Register a handler for a specific message type
 * Handlers will be called when a message of that type is received
 *
 * @param type The message type this handler responds to
 * @param handler The async handler function
 *
 * @example
 * registerHandler('GET_CREDENTIALS', async (data, sender) => {
 *   const creds = await credentialStore.getAll();
 *   return createResponse(creds);
 * });
 */
export function registerHandler<T extends BackgroundMessage | ContentMessage>(
  type: string,
  handler: HandlerFn<T>
): void {
  handlers.set(type, handler);
}

/**
 * Clear all registered handlers (useful for testing)
 */
export function clearHandlers(): void {
  handlers.clear();
}

/**
 * Dispatch an incoming message to the appropriate registered handler
 * Used in chrome.runtime.onMessage.addListener callback
 *
 * @param message The incoming message
 * @param sender The message sender info
 * @param sendResponse Callback to send the response
 * @returns boolean indicating whether the response will be sent asynchronously
 *
 * @example
 * chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
 *   return dispatchMessage(message, sender, sendResponse);
 * });
 */
export function dispatchMessage(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse<any>) => void
): boolean {
  // Validate message has a type
  if (!message || !message.type) {
    sendResponse(createErrorResponse('Message missing required "type" field'));
    return false; // Response sent synchronously
  }

  const messageType = message.type;
  const handler = handlers.get(messageType);

  // Check if handler is registered
  if (!handler) {
    sendResponse(createErrorResponse(`Unknown message type: ${messageType}`));
    return false; // Response sent synchronously
  }

  // Call the handler and normalize the response
  Promise.resolve()
    .then(() => {
      // Call the handler with the message data and sender
      return handler(message.data, sender);
    })
    .then((response) => {
      // If handler returns a response, use it as-is
      if (response && typeof response === 'object' && 'success' in response) {
        sendResponse(response);
      } else {
        // Shouldn't happen, but handle gracefully
        sendResponse(createErrorResponse('Handler returned invalid response'));
      }
    })
    .catch((error) => {
      // If handler throws, catch and return error response
      const errorMessage = error instanceof Error ? error.message : String(error);
      sendResponse(createErrorResponse(`Handler error: ${errorMessage}`));
    });

  // Return true to indicate we'll send the response asynchronously
  return true;
}

/**
 * Get a registered handler for a message type (used in testing)
 * @internal
 */
export function getHandler(type: string): HandlerFn<any, any> | undefined {
  return handlers.get(type);
}

/**
 * Get all registered message types (used in testing)
 * @internal
 */
export function getRegisteredTypes(): string[] {
  return Array.from(handlers.keys());
}
