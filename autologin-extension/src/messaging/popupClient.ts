/**
 * Task 3: Popup Client for Message Communication
 * Client for popup UI to communicate with background worker
 */

import { MessageSystem, MessageType } from './messageSystem';
import type { Credential, LoginLog, Cookie } from '../types';

/**
 * Popup client for communicating with background worker
 */
export class PopupClient {
  private messageSystem: MessageSystem;

  constructor(messageSystem: MessageSystem) {
    this.messageSystem = messageSystem;
  }

  /**
   * Get all credentials from background
   */
  async getCredentials(): Promise<Credential[]> {
    const result = await this.messageSystem.send(MessageType.GET_CREDENTIALS, {});
    return (result as { credentials: Credential[] }).credentials;
  }

  /**
   * Add new credential via background
   */
  async addCredential(credential: Credential): Promise<string> {
    const result = await this.messageSystem.send(MessageType.ADD_CREDENTIAL, credential);
    return (result as { id: string }).id;
  }

  /**
   * Update existing credential via background
   */
  async updateCredential(id: string, updates: Partial<Credential>): Promise<void> {
    await this.messageSystem.send(MessageType.UPDATE_CREDENTIAL, { id, updates });
  }

  /**
   * Delete credential via background
   */
  async deleteCredential(id: string): Promise<void> {
    await this.messageSystem.send(MessageType.DELETE_CREDENTIAL, { id });
  }

  /**
   * Start login process for account
   */
  async startLogin(accountId: string): Promise<void> {
    await this.messageSystem.send(MessageType.LOGIN_REQUEST, { accountId });
  }

  /**
   * Get login history for account
   */
  async getLoginHistory(accountId: string, limit?: number): Promise<LoginLog[]> {
    const result = await this.messageSystem.send('GET_LOGS', { accountId, limit });
    return (result as { logs: LoginLog[] }).logs;
  }

  /**
   * Export logs as CSV
   */
  async exportLogs(): Promise<string> {
    const result = await this.messageSystem.send('EXPORT_LOGS', {});
    return (result as { csv: string }).csv;
  }

  /**
   * Save cookies for account
   */
  async saveCookies(accountId: string, cookies: Cookie[]): Promise<number> {
    const result = await this.messageSystem.send('SAVE_COOKIES', { accountId, cookies });
    return (result as { count: number }).count;
  }

  /**
   * Load cookies for account
   */
  async loadCookies(accountId: string): Promise<Cookie[]> {
    const result = await this.messageSystem.send('LOAD_COOKIES', { accountId });
    return (result as { cookies: Cookie[] }).cookies;
  }

  /**
   * Test connection to background worker
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.messageSystem.send('PING', {}, { timeout: 1000 });
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

/**
 * Initialize popup handlers for background-initiated events
 */
export function initializePopupHandlers(messageSystem: MessageSystem): void {
  // Handler for status updates from background
  messageSystem.registerHandler('STATUS_UPDATE', async () => {
    // These events would be forwarded to React state/stores
    // For now, just acknowledge receipt
    return { acknowledged: true };
  });

  // Handler for login progress updates
  messageSystem.registerHandler('LOGIN_PROGRESS', async () => {
    return { acknowledged: true };
  });

  // Handler for error notifications
  messageSystem.registerHandler('ERROR_NOTIFICATION', async () => {
    return { acknowledged: true };
  });
}
