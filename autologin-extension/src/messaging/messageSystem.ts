/**
 * Task 3: Message System & Communication
 * Implements message passing between extension components (background, content, popup)
 */

/**
 * Standard message types for extension communication
 */
export const MessageType = {
  // Credential operations
  GET_CREDENTIALS: 'GET_CREDENTIALS',
  ADD_CREDENTIAL: 'ADD_CREDENTIAL',
  UPDATE_CREDENTIAL: 'UPDATE_CREDENTIAL',
  DELETE_CREDENTIAL: 'DELETE_CREDENTIAL',

  // Login operations
  LOGIN_REQUEST: 'LOGIN_REQUEST',
  LOGIN_STATUS: 'LOGIN_STATUS',

  // Popup UI events
  POPUP_OPENED: 'POPUP_OPENED',
  POPUP_CLOSED: 'POPUP_CLOSED',

  // Detection and automation
  FORM_DETECTED: 'FORM_DETECTED',
  CAPTCHA_DETECTED: 'CAPTCHA_DETECTED',
  LOGIN_COMPLETE: 'LOGIN_COMPLETE',

  // Error handling
  ERROR_OCCURRED: 'ERROR_OCCURRED',
  LOG_EVENT: 'LOG_EVENT',
} as const;

export type MessageType = typeof MessageType[keyof typeof MessageType];

/**
 * Request message sent by client
 */
export interface RequestMessage<T = any> {
  type: string;
  data?: T;
  requestId: string;
  timestamp: number;
}

/**
 * Response message sent by handler
 */
export interface ResponseMessage<T = any> {
  type: string;
  data?: T;
  requestId: string;
  timestamp: number;
  error?: string;
}

/**
 * Handler function for processing messages
 */
export type MessageHandler<T = any, R = any> = (message: RequestMessage<T>) => Promise<R>;

/**
 * Pending request tracking
 */
interface PendingRequest {
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Options for message system configuration
 */
export interface MessageSystemOptions {
  timeout?: number; // milliseconds
}

/**
 * Options for send request
 */
export interface SendOptions {
  timeout?: number;
}

/**
 * Main message system for extension communication
 */
export class MessageSystem {
  private handlers: Map<string, MessageHandler> = new Map();
  private timeout: number = 5000; // 5 second default timeout
  private pendingRequests: Map<string, PendingRequest> = new Map();

  constructor(options?: MessageSystemOptions) {
    if (options?.timeout) {
      this.timeout = options.timeout;
    }
  }

  /**
   * Get current timeout in milliseconds
   */
  getTimeout(): number {
    return this.timeout;
  }

  /**
   * Set timeout for all messages in milliseconds
   */
  setTimeout(timeout: number): void {
    this.timeout = timeout;
  }

  /**
   * Register a handler for a message type
   */
  registerHandler(type: string, handler: MessageHandler, options?: { replace?: boolean }): void {
    if (this.handlers.has(type) && !options?.replace) {
      throw new Error(`Handler for ${type} already registered`);
    }

    this.handlers.set(type, handler);
  }

  /**
   * Unregister a handler for a message type
   */
  unregisterHandler(type: string): void {
    this.handlers.delete(type);
  }

  /**
   * Check if a handler exists for a message type
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Send a message and wait for response
   */
  async send<T = any, R = any>(type: string, data?: T, options?: SendOptions): Promise<R> {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`No handler registered for ${type}`);
    }

    const requestId = this.generateRequestId();
    const timestamp = Date.now();
    const timeout = options?.timeout ?? this.timeout;

    const request: RequestMessage<T> = {
      type,
      data: data as T,
      requestId,
      timestamp,
    };

    // Create timeout promise
    let timeoutTimer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<R>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        this.cleanupRequest(requestId);
        reject(new Error(`Message timeout for ${type} after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(requestId, { timer: timeoutTimer });
    });

    // Create handler promise
    const handlerPromise = (async () => {
      try {
        return await handler(request);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(errorMsg);
      }
    })();

    // Race timeout against handler and cleanup on completion
    try {
      return await Promise.race([timeoutPromise, handlerPromise]);
    } finally {
      this.cleanupRequest(requestId);
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up pending request and clear timer
   */
  private cleanupRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);
    }
  }
}
