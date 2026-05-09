/**
 * Task 3: Content Script Message Handlers
 * Registers message handlers for content script to communicate with background worker
 */

import { MessageSystem, MessageType } from './messageSystem';

/**
 * Client for sending messages from content script to background worker
 */
export class ContentScriptClient {
  private messageSystem: MessageSystem;

  constructor(messageSystem: MessageSystem) {
    this.messageSystem = messageSystem;
  }

  /**
   * Report form detected on page
   */
  async reportFormDetected(accountId: string, formSelectors: {
    username: string;
    password: string;
    submit: string;
  }): Promise<void> {
    await this.messageSystem.send(MessageType.FORM_DETECTED, {
      accountId,
      formSelectors,
    });
  }

  /**
   * Report CAPTCHA detected on page
   */
  async reportCaptchaDetected(accountId: string, captchaType: string): Promise<void> {
    await this.messageSystem.send(MessageType.CAPTCHA_DETECTED, {
      accountId,
      captchaType,
    });
  }

  /**
   * Report login completed
   */
  async reportLoginComplete(accountId: string, success: boolean, error?: string): Promise<void> {
    await this.messageSystem.send(MessageType.LOGIN_COMPLETE, {
      accountId,
      success,
      error,
    });
  }

  /**
   * Request login action from background
   */
  async requestLogin(accountId: string): Promise<{ credential: any }> {
    return this.messageSystem.send(MessageType.LOGIN_REQUEST, { accountId });
  }

  /**
   * Send error to background for logging
   */
  async reportError(message: string, context?: Record<string, any>): Promise<void> {
    await this.messageSystem.send(MessageType.ERROR_OCCURRED, {
      message,
      context,
    });
  }
}

/**
 * Initialize content script handlers for background-initiated actions
 */
export function initializeContentHandlers(messageSystem: MessageSystem): void {
  // Handler for form filling request from background
  messageSystem.registerHandler('FILL_FORM', async (request) => {
    const { username, password, submitAfter } = request.data as {
      username: string;
      password: string;
      submitAfter?: boolean;
    };

    // These would be implemented in the actual content script
    // For now, just return success
    return { success: true, username, password, submitAfter };
  });

  // Handler for screenshot capture request
  messageSystem.registerHandler('CAPTURE_SCREENSHOT', async (request) => {
    const { stage } = request.data as { stage: 'before_login' | 'after_fill' | 'after_submit' };

    // Would be implemented in actual content script
    return { success: true, stage };
  });

  // Handler for bot detection bypass
  messageSystem.registerHandler('APPLY_STEALTH_MODE', async () => {
    // Would be implemented in actual content script
    return { success: true };
  });
}
