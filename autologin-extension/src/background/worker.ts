/**
 * Background Service Worker
 * Handles: Message routing, database operations, session management, logging
 */

import {
  registerHandler,
  dispatchMessage,
  createResponse,
  createErrorResponse,
  sendToContent,
  MESSAGE_TYPES,
  GetCredentialsResponse,
  StartLoginResponse,
  StopLoginResponse,
  LogAttemptResponse,
  GetStatusResponse,
  GetLogsResponse,
  ExportLogsResponse,
  GetStatsResponse,
  CleanupDbResponse,
  SaveSuccessFileResponse,
  ClearBrowserCookiesResponse,
  StartBatchLoginResponse,
  ResumeBatchLoginResponse,
  BatchProgress,
  DevGetLogsResponse
} from '@messaging/index';

import { credentialStore, logStore, cookieStore, dbUtils } from '@store/database';
import type { Cookie, LoginStatus } from 'src/types/index';
import { analyzeLoginFailure, analyzePageForLogin, solveCaptcha, logAIInteraction, type LoginContext } from '@automation/ai-agent';

console.log('AutoLogin: Background worker loaded');

/**
 * Track login state across tabs
 */
interface LoginState {
  accountId: string;
  startTime: number;
  status: string;
  error?: string;
}

const loginState = new Map<string, LoginState>();

/**
 * Batch login state for sequential credential processing
 */
interface BatchState {
  credentials: Array<{ id: string; url: string; username: string; password: string }>;
  currentIndex: number;
  total: number;
  status: 'running' | 'paused' | 'stopped' | 'done' | 'idle';
  delayBetweenMs: number;
  currentTabId?: number;
  startedAt: number;
}

// Use storage.local for batch state (storage.session not available in older @types/chrome)
const storageArea = chrome.storage.local;

async function getBatchState(): Promise<BatchState | null> {
  const result = await storageArea.get('batchState');
  return (result['batchState'] as BatchState) ?? null;
}

async function setBatchState(state: BatchState | null): Promise<void> {
  if (state === null) {
    await storageArea.remove('batchState');
  } else {
    await storageArea.set({ batchState: state });
  }
}

/**
 * Initialize extension on install/update
 */
chrome.runtime.onInstalled.addListener(async (details: chrome.runtime.InstalledDetails) => {
  if (details.reason === 'install') {
    console.log('AutoLogin: Extension installed');
  } else if (details.reason === 'update') {
    console.log('AutoLogin: Extension updated');
  }
});

/**
 * Main message router: dispatch all incoming messages to registered handlers
 */
chrome.runtime.onMessage.addListener((
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => {
  console.log('AutoLogin: Message received', (message as { type?: string }).type);
  return dispatchMessage(message, sender, sendResponse);
});

/**
 * Alarm listener for batch login orchestration
 */
chrome.alarms.onAlarm.addListener(async (alarm: chrome.alarms.Alarm) => {
  if (alarm.name === 'batch_next_credential') {
    await processNextCredential();
  }
});

// Type-safe data accessor for message handlers (data is typed as {} in generic handlers)
function d<T>(data: unknown): T { return data as T; }

/**
 * ============================================================================
 * Credential Handlers
 * ============================================================================
 */

/**
 * GET_CREDENTIALS: Retrieve all credentials for display in popup
 */
registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, async (_data, _sender) => {
  try {
    const credentials = await credentialStore.getAll();
    return createResponse<GetCredentialsResponse>({ credentials });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to fetch credentials: ${message}`);
  }
});

registerHandler(MESSAGE_TYPES.ADD_CREDENTIAL, async (rawData, _sender) => {
  try {
    const data = d<{ url?: string; username?: string; password?: string; password_encrypted?: string; notes?: string }>(rawData);
    if (!data?.url || !data?.username || (!data?.password && !data?.password_encrypted)) {
      return createErrorResponse('Missing required fields: url, username, password');
    }
    const id = await credentialStore.add({
      url: data.url,
      username: data.username,
      password: data.password || data.password_encrypted || '',
      notes: data.notes
    });
    return createResponse({ id, success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to add credential: ${message}`);
  }
});

registerHandler(MESSAGE_TYPES.UPDATE_CREDENTIAL, async (rawData, _sender) => {
  try {
    const data = d<{ id?: string | number; updates?: Record<string, unknown> }>(rawData);
    if (!data?.id || !data?.updates) {
      return createErrorResponse('Missing required fields: id, updates');
    }
    await credentialStore.update(String(data.id), data.updates as Partial<import('@/types/index').Credential>);
    const credential = await credentialStore.getById(String(data.id));
    if (!credential) return createErrorResponse('Credential not found after update');
    return createResponse({ credential });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to update credential: ${message}`);
  }
});

registerHandler(MESSAGE_TYPES.DELETE_CREDENTIAL, async (rawData, _sender) => {
  try {
    const data = d<{ id?: string | number }>(rawData);
    if (!data?.id) return createErrorResponse('Missing required field: id');
    await credentialStore.delete(String(data.id));
    return createResponse({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to delete credential: ${message}`);
  }
});

/**
 * ============================================================================
 * Login Handlers
 * ============================================================================
 */

/**
 * START_LOGIN: Begin login process for an account
 */
registerHandler(MESSAGE_TYPES.START_LOGIN, async (rawData, _sender) => {
  try {
    const data = d<{ accountId?: string; url?: string }>(rawData);
    if (!data?.accountId || !data?.url) {
      return createErrorResponse('Missing required fields: accountId, url');
    }
    const loginId = `login_${Date.now()}`;
    loginState.set(loginId, { accountId: data.accountId, startTime: Date.now(), status: 'IN_PROGRESS' });
    return createResponse<StartLoginResponse>({ loginId, status: 'IN_PROGRESS' as LoginStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to start login: ${message}`);
  }
});

registerHandler(MESSAGE_TYPES.STOP_LOGIN, async (rawData, _sender) => {
  try {
    const data = d<{ accountId?: string }>(rawData);
    if (!data?.accountId) return createErrorResponse('Missing required field: accountId');
    let stopped = false;
    for (const [loginId, state] of loginState.entries()) {
      if (state.accountId === data.accountId) { loginState.delete(loginId); stopped = true; break; }
    }
    return createResponse<StopLoginResponse>({ stopped });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to stop login: ${message}`);
  }
});

registerHandler(MESSAGE_TYPES.GET_STATUS, async (_data, _sender) => {
  try {
    if (loginState.size === 0) return createResponse<GetStatusResponse>({ status: 'idle' });
    const entry = loginState.entries().next().value as [string, LoginState] | undefined;
    const state = entry?.[1];
    return createResponse<GetStatusResponse>({
      status: 'logging_in',
      currentAccountId: state?.accountId,
      errorMessage: state?.error
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createResponse<GetStatusResponse>({ status: 'error', errorMessage: message });
  }
});

/**
 * ============================================================================
 * Logging Handlers
 * ============================================================================
 */

/**
 * LOG_ATTEMPT: Record a login attempt
 */
registerHandler(MESSAGE_TYPES.LOG_ATTEMPT, async (rawData, _sender) => {
  try {
    const data = d<{ account_id?: string; status?: string; timestamp?: number; duration_ms?: number; error_message?: string; captcha_type?: string }>(rawData);
    if (!data?.account_id || !data?.status || !data?.timestamp) {
      return createErrorResponse('Missing required fields: account_id, status, timestamp');
    }
    const logId = await logStore.add({
      account_id: data.account_id,
      status: data.status as LoginStatus,
      timestamp: data.timestamp,
      duration_ms: data.duration_ms,
      error_message: data.error_message,
      captcha_type: data.captcha_type
    });
    return createResponse<LogAttemptResponse>({ logId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to log attempt: ${message}`);
  }
});

registerHandler(MESSAGE_TYPES.GET_LOGS, async (rawData, _sender) => {
  try {
    const data = d<{ accountId?: string; limit?: number }>(rawData);
    const accountId = data?.accountId;
    const limit = data?.limit ?? 100;

    let logs;
    if (accountId) {
      logs = await logStore.getByAccountId(accountId, limit);
    } else {
      // Return recent logs across all accounts
      logs = await logStore.filter(undefined, undefined, limit);
    }

    return createResponse<GetLogsResponse>({
      logs
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to fetch logs: ${message}`);
  }
});

/**
 * EXPORT_LOGS: Export logs as CSV or JSON
 */
registerHandler(MESSAGE_TYPES.EXPORT_LOGS, async (rawData, _sender) => {
  try {
    const data = d<{ accountId?: string; format?: string }>(rawData);
    const accountId = data?.accountId;
    const format = data?.format ?? 'csv';

    let exportData: string;
    if (format === 'csv') {
      exportData = await logStore.exportAsCSV(accountId);
    } else {
      // JSON format
      const logs = accountId
        ? await logStore.getByAccountId(accountId, 1000)
        : await logStore.filter(undefined, undefined, 1000);
      exportData = JSON.stringify(logs, null, 2);
    }

    return createResponse<ExportLogsResponse>({
      data: exportData
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to export logs: ${message}`);
  }
});

/**
 * ============================================================================
 * Database Utility Handlers
 * ============================================================================
 */

/**
 * GET_STATS: Get database statistics
 */
registerHandler(MESSAGE_TYPES.GET_STATS, async (_data, _sender) => {
  try {
    const stats = await dbUtils.getStats();

    return createResponse<GetStatsResponse>({
      credentials: stats.credentials,
      cookies: stats.cookies,
      logs: stats.logs,
      screenshots: stats.screenshots,
      screenshotSizeBytes: stats.screenshotSizeBytes
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to get stats: ${message}`);
  }
});

/**
 * CLEANUP_DB: Clean up old data based on retention policies
 */
registerHandler(MESSAGE_TYPES.CLEANUP_DB, async (rawData, _sender) => {
  try {
    const data = d<{ maxAgeDays?: number }>(rawData);
    const maxAgeDays = data?.maxAgeDays ?? 30;
    void maxAgeDays; // used for future cleanup logic

    // Cleanup would be implemented with:
    // - cookieStore.cleanupExpired(90)
    // - logStore.cleanupOld(30)
    // - screenshotStore.cleanupOld(30)
    // For now, return placeholder

    return createResponse<CleanupDbResponse>({
      cleaned: {
        cookies: 0,
        logs: 0,
        screenshots: 0
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Cleanup failed: ${message}`);
  }
});

/**
 * ============================================================================
 * Phase 4: Batch Login & Success File Saving
 * ============================================================================
 */

/**
 * Helper: Wait for a tab to complete loading with stability check
 */
function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let completeCount = 0;
    let stabilityTimeout: ReturnType<typeof setTimeout> | null = null;
    const mainTimeout = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(mainTimeout);
      if (stabilityTimeout) clearTimeout(stabilityTimeout);
      chrome.tabs.onUpdated.removeListener(listener);
    };

    const listener = (updatedTabId: number, info: { status?: string }) => {
      if (updatedTabId === tabId) {
        // Clear previous stability check when tab updates
        if (stabilityTimeout) clearTimeout(stabilityTimeout);

        if (info.status === 'complete') {
          completeCount++;
          // Wait for tab to be stable (2 more "complete" events or 1 second)
          stabilityTimeout = setTimeout(() => {
            cleanup();
            resolve();
          }, 1000);
        }
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Helper: Save success login to file and storage
 */
type SaveableCookie = { name: string; value: string; domain: string; path: string; expirationDate?: number; expires?: number };

async function saveSuccessToFile(
  url: string,
  username: string,
  password: string,
  cookies: SaveableCookie[],
  timestamp: string | number | undefined
): Promise<void> {
  const hostname = new URL(url).hostname;
  const ts = timestamp == null ? new Date().toISOString() : typeof timestamp === 'number' ? new Date(timestamp).toISOString() : timestamp;
  const cookieLines = cookies
    .map(c => {
      const expiry = c.expirationDate ?? (c.expires ? c.expires / 1000 : undefined);
      const expiresStr = expiry ? new Date(expiry * 1000).toISOString() : 'Session';
      return (
        `Name: ${c.name}\n` +
        `Value: ${c.value}\n` +
        `Domain: ${c.domain}\n` +
        `Path: ${c.path}\n` +
        `Expires: ${expiresStr}\n` +
        `---`
      );
    })
    .join('\n');

  const content = [
    '=== Login Success ===',
    `URL: ${url}`,
    `Username: ${username}`,
    `Password: ${password}`,
    `Timestamp: ${ts}`,
    '',
    '=== Cookies ===',
    cookieLines
  ].join('\n');

  // Save to browser storage as backup
  try {
    const successLog = await new Promise<any>((res) => {
      chrome.storage.local.get('successLog', res);
    });
    const log = successLog.successLog || [];
    log.push({
      hostname,
      url,
      username,
      password,
      timestamp: ts,
      cookiesCount: cookies.length
    });
    // Keep only last 100 entries
    if (log.length > 100) log.shift();

    await new Promise<void>((res) => {
      chrome.storage.local.set({ successLog: log }, () => res());
    });
    console.log(`AutoLogin: Success logged to storage for ${username}`);
  } catch (storageError) {
    console.error(`AutoLogin: Failed to save to storage:`, storageError);
  }

  // Try to download as file (may fail in Firefox but worth attempting)
  try {
    const blob = new Blob([content], { type: 'text/plain' });
    const blobUrl = URL.createObjectURL(blob);

    chrome.downloads.download(
      {
        url: blobUrl,
        filename: `${hostname}-${username}-${Date.now()}.txt`,
        saveAs: false,
        conflictAction: 'overwrite'
      },
      (downloadId) => {
        // Clean up blob URL after a delay
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        console.log(`AutoLogin: File download initiated (ID: ${downloadId})`);
      }
    );
  } catch (downloadError) {
    console.warn(`AutoLogin: File download not available (expected in Firefox):`, downloadError);
  }
}

/**
 * Helper: Capture a screenshot of a tab as base64 PNG
 */
async function captureTabScreenshot(tabId: number): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.windowId) return null;
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } catch (error) {
    console.error('AutoLogin: Failed to capture screenshot:', error);
    return null;
  }
}

/**
 * Helper: Use AI vision to analyze page screenshot and get form selectors
 */
async function aiAnalyzePage(tabId: number, url: string): Promise<import('@automation/ai-agent').FormFieldsResult | null> {
  const screenshot = await captureTabScreenshot(tabId);
  if (!screenshot) {
    console.log('AutoLogin AI: Could not capture screenshot for analysis');
    return null;
  }

  console.log('AutoLogin AI: Screenshot captured, sending to Pollinations for analysis...');
  const result = await analyzePageForLogin(screenshot, url);

  if (!result.success) {
    console.log('AutoLogin AI: Page analysis failed');
    return null;
  }

  console.log(`AutoLogin AI: Page step detected: ${result.pageStep}, username: ${result.usernameSelector}, password: ${result.passwordSelector}, submit: ${result.submitSelector}`);
  return result;
}

/**
 * Helper: Clear browser cookies for a URL
 */
async function clearBrowserCookiesFor(url: string): Promise<void> {
  const cookies = await new Promise<chrome.cookies.Cookie[]>((res) =>
    chrome.cookies.getAll({ url }, res)
  );

  for (const cookie of cookies) {
    const scheme = cookie.secure ? 'https' : 'http';
    const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
    const cookieUrl = `${scheme}://${domain}${cookie.path}`;
    await new Promise<void>((res) =>
      chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, () => res())
    );
  }
}

/**
 * Helper: Pause batch login for user to solve CAPTCHA
 */
async function pauseForCaptcha(
  state: BatchState,
  cred: BatchState['credentials'][0],
  tabId: number,
  captchaType: string
): Promise<void> {
  console.log(`⏸️ AutoLogin: PAUSING batch - CAPTCHA detected for ${cred.username}`);
  console.log(`   CAPTCHA Type: ${captchaType}`);
  console.log(`   Please solve the CAPTCHA in the tab and press 'Continue' in the popup`);

  // Update batch state to PAUSED
  await setBatchState({
    ...state,
    status: 'paused',
    currentTabId: tabId
  });

  // Store captcha pause info for UI to display
  await chrome.storage.local.set({
    captchaPause: {
      username: cred.username,
      url: cred.url,
      type: captchaType,
      tabId: tabId,
      timestamp: Date.now()
    }
  });

  // Log the pause
  await logStore.add({
    account_id: cred.id,
    status: 'CAPTCHA_PAUSED',
    timestamp: Date.now(),
    error_message: `${captchaType} - waiting for user to solve`
  });

  // Tab remains open - user solves CAPTCHA
  // When user clicks "Continue" in popup, resumeBatchLogin will be called
}

/**
 * Helper: Resume batch login after CAPTCHA is solved
 */
async function resumeBatchLogin(): Promise<void> {
  const state = await getBatchState();
  if (!state || state.status !== 'paused') {
    console.log(`AutoLogin: No paused batch to resume`);
    return;
  }

  console.log(`▶️ AutoLogin: Resuming batch login after CAPTCHA...`);
  const cred = state.credentials[state.currentIndex];
  const tabId = state.currentTabId;

  if (!tabId) {
    console.error(`AutoLogin: Tab ID missing, cannot resume`);
    return;
  }

  // Wait a moment for page to settle after CAPTCHA solve
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Resume: continue with multi-step flow after CAPTCHA solve (use longer timeout as page may still be settling)
  let stepCount = 0;
  const maxSteps = 2;

  while (stepCount < maxSteps) {
    stepCount++;
    console.log(`AutoLogin: Form detection step ${stepCount} after CAPTCHA resume for ${cred.username}`);

    const formResp = await sendToContent(tabId, {
      type: MESSAGE_TYPES.DETECT_FORM,
      data: { url: cred.url }
    }, 10000);

    if (!formResp.success || !formResp.data?.found) {
      console.error(`AutoLogin: Could not find form at step ${stepCount} after CAPTCHA solve: ${formResp.error}`);
      await finishCredential(state, cred, 'FORM_NOT_FOUND', tabId, `Step ${stepCount} after CAPTCHA: Form not found`);
      return;
    }

    const formKind = formResp.data.kind || 'UNKNOWN';
    console.log(`AutoLogin: Detected ${formKind} at step ${stepCount} after CAPTCHA`);

    const fillResp = await sendToContent(tabId, {
      type: MESSAGE_TYPES.FILL_FORM,
      data: {
        fields: formResp.data.fields ?? {},
        username: cred.username,
        password: cred.password
      }
    }, 10000);

    if (!fillResp.success) {
      console.error(`AutoLogin: Could not fill form at step ${stepCount} after CAPTCHA: ${fillResp.error}`);
      await finishCredential(state, cred, 'FORM_FILL_FAILED', tabId, `Step ${stepCount} after CAPTCHA: ${fillResp.error}`);
      return;
    }

    console.log(`AutoLogin: Submitting form at step ${stepCount} after CAPTCHA solve for ${cred.username}`);
    const submitResp = await sendToContent(tabId, { type: MESSAGE_TYPES.SUBMIT_FORM, data: {} }, 10000);

    if (!submitResp.success) {
      console.error(`AutoLogin: Form submission failed at step ${stepCount} after CAPTCHA: ${submitResp.error}`);
      await finishCredential(state, cred, 'FORM_SUBMIT_FAILED', tabId, `Step ${stepCount}: ${submitResp.error}`);
      return;
    }

    // Wait for navigation
    await waitForTabComplete(tabId, 20000);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Break if full form or password step
    if (formKind === 'FULL_FORM' || formKind === 'PASSWORD_STEP') {
      console.log(`AutoLogin: Completed multi-step flow at step ${stepCount} after CAPTCHA`);
      break;
    }

    // Continue if email step
    if (formKind === 'EMAIL_STEP') {
      console.log(`AutoLogin: Email step completed after CAPTCHA, looping to detect password step`);
      continue;
    }
  }

  // Check login status (use longer timeout for complex pages)
  console.log(`AutoLogin: Checking login status after CAPTCHA solve for ${cred.username}`);
  const statusResp = await sendToContent(tabId, {
    type: MESSAGE_TYPES.CHECK_LOGIN_STATUS,
    data: { originalUrl: cred.url }
  }, 10000);

  const loginStatus = statusResp.data?.status ?? 'WRONG_PASSWORD';

  if (loginStatus === 'SUCCESS') {
    console.log(`✅ AutoLogin: Login successful for ${cred.username} after CAPTCHA!`);

    // Collect and save cookies
    const liveCookies = await new Promise<chrome.cookies.Cookie[]>((res) =>
      chrome.cookies.getAll({ url: cred.url }, res)
    );

    try {
      await saveSuccessToFile(cred.url, cred.username, cred.password, liveCookies, new Date().toISOString());
      console.log(`✅ AutoLogin: File saved for ${cred.username}`);
    } catch (e) {
      console.warn(`AutoLogin: File save failed:`, e);
    }

    const dbCookies: Cookie[] = liveCookies.map(c => ({
      account_id: cred.id,
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expirationDate ? c.expirationDate * 1000 : undefined,
      httpOnly: c.httpOnly,
      secure: c.secure
    }));

    await cookieStore.saveCookies(cred.id, dbCookies);

    // Attempt logout
    try {
      await sendToContent(tabId, { type: MESSAGE_TYPES.LOGOUT_PAGE, data: { url: cred.url } });
      await waitForTabComplete(tabId, 5000);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.error(`AutoLogin: Logout failed:`, e);
    }

    // Clear cookies
    try {
      await clearBrowserCookiesFor(cred.url);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (e) {
      console.error(`AutoLogin: Cookie clear failed:`, e);
    }

    await logStore.add({
      account_id: cred.id,
      status: 'SUCCESS',
      timestamp: Date.now(),
      error_message: 'Solved via CAPTCHA pause'
    });
  } else {
    console.log(`❌ AutoLogin: Login failed after CAPTCHA for ${cred.username}: ${loginStatus}`);
    await logStore.add({
      account_id: cred.id,
      status: loginStatus as any,
      timestamp: Date.now(),
      error_message: statusResp.data?.errorText
    });
  }

  // Advance and schedule next
  const freshState = await getBatchState();
  if (!freshState || freshState.status !== 'paused') return;

  await setBatchState({
    ...freshState,
    status: 'running',
    currentIndex: freshState.currentIndex + 1,
    currentTabId: undefined
  });

  // Clear captcha pause info
  await chrome.storage.local.remove('captchaPause');

  // Close tab
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // ignore
  }

  // Schedule next
  const delayMs = Math.max(freshState.delayBetweenMs, 5000);
  const delayMinutes = delayMs / 60000;
  console.log(`AutoLogin: Scheduling next credential in ${delayMs}ms`);
  chrome.alarms.create('batch_next_credential', { delayInMinutes: delayMinutes });
}

/**
 * Helper: Invoke AI agent to analyze login failure
 */
async function invokeAIForFailure(
  cred: BatchState['credentials'][0],
  status: string,
  errorMsg: string,
  _tabId: number
): Promise<void> {
  try {
    console.log(`AutoLogin: Invoking AI agent for failure analysis: ${cred.username} - ${status}`);

    const context: LoginContext = {
      credential: {
        url: cred.url,
        username: cred.username,
        password: cred.password
      },
      status: status as any,
      error: errorMsg,
      pageUrl: cred.url,
      attemptNumber: 1
    };

    const aiResponse = await analyzeLoginFailure(context);

    logAIInteraction(cred.id, context, aiResponse);

    if (aiResponse.success) {
      console.log(`AutoLogin AI: Analysis for ${cred.username}:`, aiResponse.diagnosis);
      console.log(`AutoLogin AI: Recommendations:`, aiResponse.recommendations);

      // Store AI insights in session storage for UI to display
      await chrome.storage.local.set({
        [`ai_insight_${cred.id}`]: {
          diagnosis: aiResponse.diagnosis,
          recommendations: aiResponse.recommendations,
          shouldRetry: aiResponse.shouldRetry,
          urgency: aiResponse.urgency,
          confidence: aiResponse.confidence,
          timestamp: Date.now()
        }
      });
    }
  } catch (error) {
    console.error('AutoLogin: Failed to invoke AI agent:', error);
  }
}

/**
 * Helper: Finish current credential (log result, advance index, schedule next)
 */
async function finishCredential(
  _state: BatchState,
  cred: BatchState['credentials'][0],
  status: string,
  tabId: number,
  errorMsg: string
): Promise<void> {
  // Invoke AI agent for failure analysis (async, don't wait)
  if (status !== 'SUCCESS') {
    invokeAIForFailure(cred, status, errorMsg, tabId).catch(e =>
      console.error('AutoLogin: AI analysis failed:', e)
    );
  }

  await logStore.add({
    account_id: cred.id,
    status: status as any,
    timestamp: Date.now(),
    error_message: errorMsg
  });

  const freshState = await getBatchState();
  if (!freshState || freshState.status !== 'running') return;

  await setBatchState({
    ...freshState,
    currentIndex: freshState.currentIndex + 1,
    currentTabId: undefined
  });

  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // ignore
  }

  // Use at least 5 seconds delay between accounts for session cleanup
  const delayMs = Math.max(freshState.delayBetweenMs, 5000);
  const delayMinutes = delayMs / 60000;
  console.log(`AutoLogin: Scheduling next credential in ${delayMs}ms`);
  chrome.alarms.create('batch_next_credential', {
    delayInMinutes: delayMinutes
  });
}

/**
 * Process the next credential in the batch
 */
async function processNextCredential(): Promise<void> {
  const state = await getBatchState();
  if (!state || state.status !== 'running') return;

  if (state.currentIndex >= state.total) {
    await setBatchState({ ...state, status: 'done', currentTabId: undefined });
    return;
  }

  const cred = state.credentials[state.currentIndex];

  // Close previous tab if any
  if (state.currentTabId !== undefined) {
    try {
      await chrome.tabs.remove(state.currentTabId);
    } catch {
      // ignore
    }
  }

  // Clear ALL cookies from the domain before opening new tab
  console.log(`AutoLogin: Clearing cookies for ${cred.url} before next attempt`);
  try {
    await clearBrowserCookiesFor(cred.url);
    // Add delay to ensure cookies are cleared
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`AutoLogin: Failed to clear cookies:`, error);
  }

  // Open tab for this credential's URL
  const tab = await new Promise<chrome.tabs.Tab>((res, rej) =>
    chrome.tabs.create({ url: cred.url, active: false }, (t) => {
      if (chrome.runtime.lastError) {
        rej(new Error(chrome.runtime.lastError.message));
      } else {
        res(t);
      }
    })
  );

  const tabId = tab.id!;
  await setBatchState({ ...state, currentTabId: tabId });

  // Wait for page load (increased from 15s to 20s)
  console.log(`AutoLogin: Waiting for page to load for ${cred.username}...`);
  await waitForTabComplete(tabId, 20000);

  // Additional delay to ensure page is ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // AI-vision multi-step form handling (email → next → password → submit)
  let stepCount = 0;
  const maxSteps = 6;
  let captchaAttempts = 0;

  while (stepCount < maxSteps) {
    stepCount++;
    console.log(`AutoLogin: AI analyzing page at step ${stepCount} for ${cred.username}`);

    // Use AI vision to analyze current page screenshot
    const currentTab = await chrome.tabs.get(tabId).catch(() => null);
    const currentUrl = currentTab?.url || cred.url;
    const aiResult = await aiAnalyzePage(tabId, currentUrl);

    if (!aiResult) {
      console.log(`AutoLogin: AI page analysis unavailable at step ${stepCount}, falling back to DOM detection`);
      // Fallback to content script DOM detection
      const formResp = await sendToContent(tabId, { type: MESSAGE_TYPES.DETECT_FORM, data: { url: cred.url } }, 10000);
      if (!formResp.success || !formResp.data?.found) {
        await finishCredential(state, cred, 'FORM_NOT_FOUND', tabId, `Step ${stepCount}: Neither AI nor DOM found form`);
        return;
      }
    } else {
      // Check if already on dashboard
      if (aiResult.pageStep === 'dashboard') {
        console.log(`✅ AutoLogin: AI detected dashboard - login successful for ${cred.username}`);
        break;
      }

      // AI detected CAPTCHA — attempt to solve it
      if (aiResult.captchaDetected || aiResult.pageStep === 'captcha') {
        captchaAttempts++;
        console.log(`AutoLogin AI: CAPTCHA detected at step ${stepCount} (attempt ${captchaAttempts}) — invoking AI CAPTCHA solver`);

        // After 2 failed CAPTCHA attempts on same page, pause for human
        if (captchaAttempts > 2) {
          console.log(`⚠️ AutoLogin AI: CAPTCHA persists after ${captchaAttempts - 1} solve attempts — pausing for human`);
          await pauseForCaptcha(state, cred, tabId, 'recaptcha_v2');
          return;
        }

        const currentTab2 = await chrome.tabs.get(tabId).catch(() => null);
        const captchaUrl = currentTab2?.url || cred.url;
        const urlBeforeCaptcha = captchaUrl;
        const captchaScreenshot = await captureTabScreenshot(tabId);

        if (captchaScreenshot) {
          const captchaSolution = await solveCaptcha(captchaScreenshot, captchaUrl);
          console.log(`AutoLogin AI: CAPTCHA solution:`, captchaSolution);

          // reCAPTCHA image challenge (tile grid) and hCaptcha cannot be reliably solved — pause immediately
          if (captchaSolution.captchaType === 'image_grid' || captchaSolution.captchaType === 'hcaptcha') {
            console.log(`⚠️ AutoLogin AI: Image grid CAPTCHA detected — pausing for human`);
            await pauseForCaptcha(state, cred, tabId, captchaSolution.captchaType);
            return;
          }

          if (captchaSolution.needsHuman || !captchaSolution.success || captchaSolution.captchaType === 'unknown') {
            console.log(`⚠️ AutoLogin AI: CAPTCHA needs human intervention (type: ${captchaSolution.captchaType})`);
            await pauseForCaptcha(state, cred, tabId, captchaSolution.captchaType || 'unknown');
            return;
          }

          // Execute the AI solution in the content script
          const execResp = await sendToContent(tabId, {
            type: MESSAGE_TYPES.EXECUTE_CAPTCHA,
            data: {
              captchaType: captchaSolution.captchaType,
              answer: captchaSolution.answer,
              tileIndices: captchaSolution.tileIndices,
              clickCheckbox: captchaSolution.clickCheckbox,
              inputSelector: captchaSolution.inputSelector,
              checkboxSelector: captchaSolution.checkboxSelector
            }
          }, 15000);

          if (execResp.success && execResp.data?.solved) {
            console.log(`✅ AutoLogin AI: CAPTCHA action done via ${execResp.data.method}`);
            // Wait longer for CAPTCHA iframe to update
            await new Promise(resolve => setTimeout(resolve, 4000));
            await waitForTabComplete(tabId, 15000);
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Check if URL changed — if still same page, CAPTCHA may have triggered image challenge
            const tabAfter = await chrome.tabs.get(tabId).catch(() => null);
            const urlAfter = tabAfter?.url || '';
            if (urlAfter === urlBeforeCaptcha) {
              console.log(`AutoLogin AI: URL unchanged after CAPTCHA click — taking new screenshot to reassess`);
            }
            continue; // Loop back to re-analyze the page
          } else {
            console.log(`⚠️ AutoLogin AI: CAPTCHA solve attempt failed (${execResp.data?.error}) — pausing for human`);
            await pauseForCaptcha(state, cred, tabId, captchaSolution.captchaType);
            return;
          }
        } else {
          console.log(`⚠️ AutoLogin AI: Cannot screenshot for CAPTCHA solve — pausing for human`);
          await pauseForCaptcha(state, cred, tabId, 'unknown');
          return;
        }
      }

      // Reset CAPTCHA counter when we move past the CAPTCHA step
      captchaAttempts = 0;

      // No form found by AI
      if (!aiResult.usernameSelector && !aiResult.passwordSelector) {
        console.log(`AutoLogin: AI found no form fields at step ${stepCount} (pageStep: ${aiResult.pageStep})`);
        await finishCredential(state, cred, 'FORM_NOT_FOUND', tabId, `Step ${stepCount}: AI detected no login fields (${aiResult.pageStep})`);
        return;
      }

      // Fill fields AI identified
      const fields: { username_selector?: string; password_selector?: string; submit_selector?: string } = {};
      if (aiResult.usernameSelector) fields.username_selector = aiResult.usernameSelector;
      if (aiResult.passwordSelector) fields.password_selector = aiResult.passwordSelector;
      if (aiResult.submitSelector) fields.submit_selector = aiResult.submitSelector;

      console.log(`AutoLogin AI: Filling form step ${stepCount} - pageStep: ${aiResult.pageStep}, fields:`, fields);

      const fillResp = await sendToContent(tabId, {
        type: MESSAGE_TYPES.FILL_FORM,
        data: { fields, username: cred.username, password: cred.password }
      }, 10000);

      if (!fillResp.success) {
        console.log(`AutoLogin: Fill failed at step ${stepCount}: ${fillResp.error}`);
        await finishCredential(state, cred, 'FORM_FILL_FAILED', tabId, `Step ${stepCount}: ${fillResp.error}`);
        return;
      }
      console.log(`AutoLogin: Filled ${fillResp.data?.fieldsFilled} fields at step ${stepCount}`);

      // Click the submit/next button AI identified
      const submitSelector = aiResult.submitSelector;
      console.log(`AutoLogin AI: Clicking submit button: "${submitSelector}" at step ${stepCount}`);
      const submitResp = await sendToContent(tabId, {
        type: MESSAGE_TYPES.SUBMIT_FORM,
        data: { selector: submitSelector }
      }, 10000);

      if (!submitResp.success) {
        console.log(`AutoLogin: Submit failed at step ${stepCount}: ${submitResp.error}`);
        await finishCredential(state, cred, 'FORM_SUBMIT_FAILED', tabId, `Step ${stepCount}: ${submitResp.error}`);
        return;
      }

      console.log(`AutoLogin: Submitted form at step ${stepCount}`);

      // Wait for navigation after submit
      await waitForTabComplete(tabId, 20000);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // If password step done, we're done
      if (aiResult.pageStep === 'password' || aiResult.pageStep === 'full') {
        console.log(`AutoLogin: Password step completed at step ${stepCount}, checking login status`);
        break;
      }

      // Email step done — loop for password step
      if (aiResult.pageStep === 'email') {
        console.log(`AutoLogin: Email step done at step ${stepCount}, looping for password step`);
        continue;
      }
    }
  }

  // Check login status (use longer timeout)
  console.log(`AutoLogin: Checking login status for ${cred.username}`);
  const statusResp = await sendToContent(tabId, {
    type: MESSAGE_TYPES.CHECK_LOGIN_STATUS,
    data: { originalUrl: cred.url }
  }, 10000);

  const loginStatus = statusResp.data?.status ?? 'WRONG_PASSWORD';

  if (loginStatus === 'SUCCESS') {
    console.log(`✅ AutoLogin: Login successful for ${cred.username}!`);

    // Collect live cookies WHILE STILL LOGGED IN
    console.log(`AutoLogin: Collecting cookies for ${cred.username}`);
    const liveCookies = await new Promise<chrome.cookies.Cookie[]>((res) =>
      chrome.cookies.getAll({ url: cred.url }, res)
    );
    console.log(`AutoLogin: Collected ${liveCookies.length} cookies`);

    // Save to file IMMEDIATELY after collecting
    console.log(`AutoLogin: Saving credentials and cookies to file for ${cred.username}`);
    try {
      await saveSuccessToFile(cred.url, cred.username, cred.password, liveCookies, new Date().toISOString());
      console.log(`✅ AutoLogin: File saved successfully for ${cred.username}`);
    } catch (fileError) {
      console.error(`❌ AutoLogin: Failed to save file:`, fileError);
    }

    // Save cookies to DB IMMEDIATELY
    console.log(`AutoLogin: Saving ${liveCookies.length} cookies to database`);
    const dbCookies: Cookie[] = liveCookies.map(c => ({
      account_id: cred.id,
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expirationDate ? c.expirationDate * 1000 : undefined,
      httpOnly: c.httpOnly,
      secure: c.secure
    }));

    try {
      await cookieStore.saveCookies(cred.id, dbCookies);
      console.log(`✅ AutoLogin: Cookies saved to DB for ${cred.username}`);
    } catch (dbError) {
      console.error(`❌ AutoLogin: Failed to save cookies to DB:`, dbError);
    }

    // THEN attempt logout (non-fatal)
    console.log(`AutoLogin: Attempting logout for ${cred.username}`);
    try {
      await sendToContent(tabId, {
        type: MESSAGE_TYPES.LOGOUT_PAGE,
        data: { url: cred.url }
      });
      await waitForTabComplete(tabId, 5000);
      // Add delay after logout
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`✅ AutoLogin: Logout completed for ${cred.username}`);
    } catch (error) {
      console.error(`AutoLogin: Logout attempt failed:`, error);
    }

    // Clear browser cookies AFTER logout
    console.log(`AutoLogin: Clearing all cookies for ${cred.url}`);
    try {
      await clearBrowserCookiesFor(cred.url);
      // Give time for cookie deletion to sync
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log(`✅ AutoLogin: Cookies cleared for ${cred.url}`);
    } catch (error) {
      console.error(`AutoLogin: Cookie clearing failed:`, error);
    }

    // Log success
    await logStore.add({
      account_id: cred.id,
      status: 'SUCCESS',
      timestamp: Date.now()
    });
    console.log(`✅ AutoLogin: Success logged for ${cred.username}`);
  } else {
    // Handle different failure types
    if (loginStatus === 'CAPTCHA_TIMEOUT') {
      console.log(`⚠️ AutoLogin: CAPTCHA appeared after submission for ${cred.username}`);
    } else if (loginStatus === 'WRONG_PASSWORD') {
      console.log(`❌ AutoLogin: Wrong password for ${cred.username}: ${statusResp.data?.errorText}`);
    } else if (loginStatus === 'IN_PROGRESS') {
      console.log(`⏳ AutoLogin: Login still in progress for ${cred.username} (may have failed)`);
    }

    // Log failure
    await logStore.add({
      account_id: cred.id,
      status: loginStatus as any,
      timestamp: Date.now(),
      error_message: statusResp.data?.errorText
    });
  }

  // Advance to next
  const freshState = await getBatchState();
  if (!freshState || freshState.status !== 'running') return;

  await setBatchState({
    ...freshState,
    currentIndex: freshState.currentIndex + 1,
    currentTabId: undefined
  });

  // Close current tab
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // ignore
  }

  // Schedule next
  chrome.alarms.create('batch_next_credential', {
    delayInMinutes: Math.max(freshState.delayBetweenMs, 1000) / 60000
  });
}

/**
 * SAVE_SUCCESS_FILE: Save login credentials and cookies to file
 */
registerHandler(MESSAGE_TYPES.SAVE_SUCCESS_FILE, async (rawData, _sender) => {
  try {
    const data = d<{ url: string; username: string; password: string; cookies?: Cookie[]; timestamp?: number }>(rawData);
    const { url, username, password, cookies, timestamp } = data;
    await saveSuccessToFile(url, username, password, cookies ?? [], timestamp);

    const hostname = new URL(url).hostname;
    return createResponse<SaveSuccessFileResponse>({
      saved: true,
      filename: `logscomplete\\${hostname}-correct.txt`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to save file: ${message}`);
  }
});

/**
 * CLEAR_BROWSER_COOKIES: Remove all cookies for a domain
 */
registerHandler(MESSAGE_TYPES.CLEAR_BROWSER_COOKIES, async (rawData, _sender) => {
  try {
    const data = d<{ url: string }>(rawData);
    const { url } = data;
    const allCookies = await new Promise<chrome.cookies.Cookie[]>((res, rej) =>
      chrome.cookies.getAll({ url }, (cookies) => {
        if (chrome.runtime.lastError) {
          rej(new Error(chrome.runtime.lastError.message));
        } else {
          res(cookies);
        }
      })
    );

    let cleared = 0;
    for (const cookie of allCookies) {
      const scheme = cookie.secure ? 'https' : 'http';
      const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      const cookieUrl = `${scheme}://${domain}${cookie.path}`;
      await new Promise<void>((res) =>
        chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, () => res())
      );
      cleared++;
    }

    return createResponse<ClearBrowserCookiesResponse>({ cleared });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to clear cookies: ${message}`);
  }
});

/**
 * START_BATCH_LOGIN: Begin batch processing of all credentials
 */
registerHandler(MESSAGE_TYPES.START_BATCH_LOGIN, async (rawData, _sender) => {
  try {
    const data = d<{ delayBetweenMs?: number }>(rawData);
    const credentials = await credentialStore.getAll();
    if (credentials.length === 0) {
      return createErrorResponse('No credentials to process');
    }

    const credList = credentials.map(c => ({
      id: c.id!,
      url: c.url,
      username: c.username,
      password: c.password!
    }));

    const state: BatchState = {
      credentials: credList,
      currentIndex: 0,
      total: credList.length,
      status: 'running',
      delayBetweenMs: data?.delayBetweenMs ?? 3000,
      startedAt: Date.now()
    };

    await setBatchState(state);
    await processNextCredential();

    return createResponse<StartBatchLoginResponse>({ started: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to start batch: ${message}`);
  }
});

/**
 * STOP_BATCH_LOGIN: Stop batch processing
 */
registerHandler(MESSAGE_TYPES.STOP_BATCH_LOGIN, async (_data, _sender) => {
  try {
    chrome.alarms.clear('batch_next_credential');
    const state = await getBatchState();
    if (state) {
      if (state.currentTabId) {
        try {
          await chrome.tabs.remove(state.currentTabId);
        } catch {
          // ignore
        }
      }
      await setBatchState({ ...state, status: 'stopped' });
    }
    return createResponse({ stopped: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to stop batch: ${message}`);
  }
});

/**
 * RESUME_BATCH_LOGIN: Resume after CAPTCHA is solved
 * Returns immediately - actual resumption happens asynchronously in background
 */
registerHandler(MESSAGE_TYPES.RESUME_BATCH_LOGIN, async (_data, _sender) => {
  try {
    const state = await getBatchState();
    if (!state || state.status !== 'paused') {
      return createErrorResponse('No paused batch to resume');
    }

    // Check if already resuming (prevent double-clicks)
    const resumingKey = `batch_resuming_${state.currentIndex}`;
    const resuming = await chrome.storage.local.get(resumingKey);
    if (resuming[resumingKey]) {
      return createErrorResponse('Resume already in progress');
    }

    // Mark as resuming to prevent double-clicks
    await chrome.storage.local.set({ [resumingKey]: true });

    // Start resumption in background (don't wait for it)
    resumeBatchLogin().finally(() => {
      chrome.storage.local.remove(resumingKey);
    });

    return createResponse<ResumeBatchLoginResponse>({ resumed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to resume batch: ${message}`);
  }
});

/**
 * GET_BATCH_STATUS: Get current batch progress
 */
registerHandler(MESSAGE_TYPES.GET_BATCH_STATUS, async (_data, _sender) => {
  try {
    const state = await getBatchState();
    if (!state) {
      return createResponse<BatchProgress>({
        total: 0,
        completed: 0,
        status: 'idle'
      });
    }

    const current =
      state.currentIndex < state.total
        ? `${state.credentials[state.currentIndex].username} @ ${new URL(state.credentials[state.currentIndex].url).hostname}`
        : undefined;

    return createResponse<BatchProgress>({
      total: state.total,
      completed: state.currentIndex,
      current,
      currentUrl: state.currentIndex < state.total ? state.credentials[state.currentIndex].url : undefined,
      status: state.status
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to get batch status: ${message}`);
  }
});

/**
 * DEV_GET_LOGS: Developer mode - get recent logs
 */
registerHandler(MESSAGE_TYPES.DEV_GET_LOGS, async (rawData, _sender) => {
  try {
    const data = d<{ limit?: number }>(rawData);
    const limit = data?.limit ?? 50;
    const logs = await logStore.filter(undefined, undefined, limit);
    return createResponse<DevGetLogsResponse>({ logs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to get logs: ${message}`);
  }
});

/**
 * DEV_CLEAR_DATA: Developer mode - clear all extension data
 */
registerHandler(MESSAGE_TYPES.DEV_CLEAR_DATA, async (_data, _sender) => {
  try {
    await dbUtils.clearAll().catch(() => {
      // if clearAll doesn't exist, clear individually
    });
    await setBatchState(null);
    return createResponse({ cleared: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Failed to clear data: ${message}`);
  }
});

export {};
