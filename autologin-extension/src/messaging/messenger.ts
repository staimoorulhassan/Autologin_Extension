/**
 * Message Messenger
 * Handles sending typed messages from popup/background to other components
 * with automatic timeout handling, error normalization, and Promise wrapping
 */

import {
  BackgroundMessage,
  ContentMessage,
  MessageResponse,
  TimeoutError,
  MessageResponseMap
} from './types';

/**
 * Send a typed message to the background service worker from the popup
 *
 * @param message The typed background message to send
 * @param timeoutMs Timeout in milliseconds (default 5000)
 * @returns Promise resolving to typed response
 * @throws TimeoutError if no response within timeoutMs
 * @throws Error if chrome.runtime.lastError is set
 */
export async function sendToBackground<T extends BackgroundMessage>(
  message: T,
  timeoutMs = 5000
): Promise<MessageResponse<MessageResponseMap[T['type']]>> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(`Background message '${message.type}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage(message, (response: any) => {
        clearTimeout(timeoutId);

        // Check for Chrome API errors
        if (chrome.runtime.lastError) {
          reject(new Error(`Chrome error: ${chrome.runtime.lastError.message}`));
          return;
        }

        // Validate response shape
        if (!response || typeof response !== 'object') {
          reject(new Error('Invalid response: expected object'));
          return;
        }

        resolve(response as MessageResponse<MessageResponseMap[T['type']]>);
      });
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * Send a typed message to the content script on a specific tab
 *
 * @param tabId The tab ID to send the message to
 * @param message The typed content message to send
 * @param timeoutMs Timeout in milliseconds (default 5000)
 * @returns Promise resolving to typed response
 * @throws TimeoutError if no response within timeoutMs
 * @throws Error if content script is not injected or chrome error occurs
 */
export async function sendToContent<T extends ContentMessage>(
  tabId: number,
  message: T,
  timeoutMs = 5000
): Promise<MessageResponse<MessageResponseMap[T['type']]>> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(`Content message '${message.type}' to tab ${tabId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      chrome.tabs.sendMessage(tabId, message, (response: any) => {
        clearTimeout(timeoutId);

        // Check for Chrome API errors (including "receiving end does not exist")
        if (chrome.runtime.lastError) {
          reject(new Error(`Chrome error: ${chrome.runtime.lastError.message}`));
          return;
        }

        // Validate response shape
        if (!response || typeof response !== 'object') {
          reject(new Error('Invalid response: expected object'));
          return;
        }

        resolve(response as MessageResponse<MessageResponseMap[T['type']]>);
      });
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * Send a typed message to the content script on the currently active tab
 * Automatically queries the active tab before sending
 *
 * @param message The typed content message to send
 * @param timeoutMs Timeout in milliseconds (default 5000)
 * @returns Promise resolving to typed response
 * @throws Error if no active tab found, content script not injected, or timeout
 */
export async function sendToActiveTab<T extends ContentMessage>(
  message: T,
  timeoutMs = 5000
): Promise<MessageResponse<MessageResponseMap[T['type']]>> {
  return new Promise(async (resolve, reject) => {
    try {
      // Query for the active tab in the current window
      const tabs = await chromeTabsQuery({ active: true, currentWindow: true });

      if (tabs.length === 0) {
        throw new Error('No active tab found in current window');
      }

      const tabId = tabs[0].id;
      if (tabId === undefined) {
        throw new Error('Active tab has no ID');
      }

      // Send message to the active tab
      const response = await sendToContent(tabId, message, timeoutMs);
      resolve(response);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Wrap a Chrome API callback-style method to return a Promise
 * Used internally for chrome.tabs.query wrapping
 *
 * @internal
 */
function chromeTabsQuery(
  queryInfo: chrome.tabs.QueryInfo
): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.query(queryInfo, (tabs: any) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`chrome.tabs.query failed: ${chrome.runtime.lastError.message}`));
        } else {
          resolve(tabs);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
