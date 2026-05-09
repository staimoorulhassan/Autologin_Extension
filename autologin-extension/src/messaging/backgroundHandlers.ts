/**
 * Task 3: Background Worker Message Handlers
 * Registers message handlers for background worker to handle requests from popup and content script
 */

import { MessageSystem, MessageType } from './messageSystem';
import { credentialStore, logStore, cookieStore } from '../store/database';
import type { Credential, LoginLog, Cookie } from '../types';

/**
 * Initialize background worker message handlers
 */
export function initializeBackgroundHandlers(messageSystem: MessageSystem): void {
  // Credential operations
  registerCredentialHandlers(messageSystem);

  // Login operations
  registerLoginHandlers(messageSystem);

  // Cookie operations
  registerCookieHandlers(messageSystem);

  // Logging operations
  registerLoggingHandlers(messageSystem);
}

/**
 * Register handlers for credential operations
 */
function registerCredentialHandlers(messageSystem: MessageSystem): void {
  // Get all credentials
  messageSystem.registerHandler(MessageType.GET_CREDENTIALS, async () => {
    const credentials = await credentialStore.getAll();
    return { credentials };
  });

  // Add credential
  messageSystem.registerHandler(MessageType.ADD_CREDENTIAL, async (request) => {
    const credential = request.data as Credential;
    const id = await credentialStore.add(credential);
    return { id, success: true };
  });

  // Update credential
  messageSystem.registerHandler(MessageType.UPDATE_CREDENTIAL, async (request) => {
    const { id, updates } = request.data as { id: string; updates: Partial<Credential> };
    await credentialStore.update(id, updates);
    return { success: true };
  });

  // Delete credential
  messageSystem.registerHandler(MessageType.DELETE_CREDENTIAL, async (request) => {
    const { id } = request.data as { id: string };
    await credentialStore.delete(id);
    return { success: true };
  });
}

/**
 * Register handlers for login operations
 */
function registerLoginHandlers(messageSystem: MessageSystem): void {
  // Get login request
  messageSystem.registerHandler(MessageType.LOGIN_REQUEST, async (request) => {
    const { accountId } = request.data as { accountId: string };
    const credential = await credentialStore.getById(accountId);

    if (!credential) {
      throw new Error(`Credential not found: ${accountId}`);
    }

    return { credential };
  });

  // Update login status
  messageSystem.registerHandler(MessageType.LOGIN_STATUS, async (request) => {
    const log = request.data as LoginLog;
    const id = await logStore.add(log);
    return { id, success: true };
  });
}

/**
 * Register handlers for cookie operations
 */
function registerCookieHandlers(messageSystem: MessageSystem): void {
  // Save cookies for account
  messageSystem.registerHandler('SAVE_COOKIES', async (request) => {
    const { accountId, cookies } = request.data as { accountId: string; cookies: Cookie[] };
    await cookieStore.saveCookies(accountId, cookies);
    return { success: true, count: cookies.length };
  });

  // Load cookies for account
  messageSystem.registerHandler('LOAD_COOKIES', async (request) => {
    const { accountId } = request.data as { accountId: string };
    const cookies = await cookieStore.loadCookies(accountId);
    return { cookies };
  });
}

/**
 * Register handlers for logging operations
 */
function registerLoggingHandlers(messageSystem: MessageSystem): void {
  // Log event (alias for LOGIN_STATUS)
  messageSystem.registerHandler(MessageType.LOG_EVENT, async (request) => {
    const log = request.data as LoginLog;
    const id = await logStore.add(log);
    return { id, success: true };
  });

  // Get logs for account
  messageSystem.registerHandler('GET_LOGS', async (request) => {
    const { accountId, limit } = request.data as { accountId: string; limit?: number };
    const logs = await logStore.getByAccountId(accountId, limit);
    return { logs };
  });

  // Export logs as CSV
  messageSystem.registerHandler('EXPORT_LOGS', async () => {
    const csv = await logStore.exportAsCSV();
    return { csv };
  });
}
