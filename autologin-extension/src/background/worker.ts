/**
 * Background Service Worker — AI Orchestration Architecture
 *
 * Batch flow:
 *   1. Credentials grouped by hostname (all accounts for same site together)
 *   2. Tab opened ACTIVE so captureVisibleTab/captureTab works
 *   3. Per-step AI loop: screenshot → decideNextAction → execute → checkpoint → repeat
 *   4. After 3 consecutive failures on a hostname: pause, ask user for instruction
 *   5. First success on a hostname → save selector template for remaining accounts
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
  ExportSuccessLogResponse,
  ClearBrowserCookiesResponse,
  StartBatchLoginResponse,
  ResumeBatchLoginResponse,
  BatchProgress,
  DevGetLogsResponse
} from '@messaging/index';

import { credentialStore, logStore, cookieStore, dbUtils } from '@store/database';
import type { Cookie, LoginStatus } from 'src/types/index';
import {
  analyzeLoginFailure,
  logAIInteraction,
  decideNextAction,
  getSiteHintsForUrl,
  type LoginContext,
  type LoginTemplate,
  type ActionContext
} from '@automation/ai-agent';

console.log('AutoLogin: Background worker loaded (orchestration architecture)');

// ============================================================================
// Types
// ============================================================================

interface LoginState {
  accountId: string;
  startTime: number;
  status: string;
  error?: string;
}

const loginState = new Map<string, LoginState>();

interface OrchestratorAccount {
  id: string;
  url: string;
  username: string;
  password: string;
  hostname: string;
}

interface StepRecord {
  action: string;
  selector?: string;
  fieldType?: string;
  commentary: string;
  result: 'ok' | 'failed';
  timestamp: number;
}

interface OrchestratorState {
  status: 'idle' | 'running' | 'waiting_instruction' | 'captcha_pause' | 'done' | 'stopped';
  accounts: OrchestratorAccount[];
  currentIndex: number;
  total: number;
  currentTabId?: number;
  startedAt: number;
  delayBetweenMs: number;
  templates: Record<string, LoginTemplate>;
  hostnameFailures: Record<string, number>;
  currentSteps: StepRecord[];
  escalation?: { hostname: string; reason: string };
  pendingInstruction?: string;
}

interface AiFeedEntry {
  id: string;
  accountId: string;
  username: string;
  hostname: string;
  commentary: string;
  action: string;
  timestamp: number;
}

// ============================================================================
// State storage
// ============================================================================

async function getOrchestratorState(): Promise<OrchestratorState | null> {
  const r = await chrome.storage.local.get('orchestratorState');
  return (r['orchestratorState'] as OrchestratorState) ?? null;
}

async function setOrchestratorState(state: OrchestratorState | null): Promise<void> {
  if (state === null) {
    await chrome.storage.local.remove('orchestratorState');
  } else {
    await chrome.storage.local.set({ orchestratorState: state });
  }
}

async function appendToAiFeed(entry: Omit<AiFeedEntry, 'id'>): Promise<void> {
  const r = await chrome.storage.local.get('ai_feed');
  const feed = (r['ai_feed'] as AiFeedEntry[]) ?? [];
  const newEntry: AiFeedEntry = {
    ...entry,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  };
  await chrome.storage.local.set({ ai_feed: [...feed, newEntry].slice(-120) });
}

// ============================================================================
// Startup
// ============================================================================

chrome.runtime.onInstalled.addListener(async (details: chrome.runtime.InstalledDetails) => {
  if (details.reason === 'install') console.log('AutoLogin: Extension installed');
  else if (details.reason === 'update') console.log('AutoLogin: Extension updated');
});

chrome.runtime.onMessage.addListener((
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => {
  console.log('AutoLogin: Message received', (message as { type?: string }).type);
  return dispatchMessage(message, sender, sendResponse);
});

// ============================================================================
// Alarm — single tick drives the whole orchestration state machine
// ============================================================================

chrome.alarms.onAlarm.addListener(async (alarm: chrome.alarms.Alarm) => {
  if (alarm.name !== 'batch_tick') return;

  const state = await getOrchestratorState();
  if (!state || state.status !== 'running') return;

  if (state.currentIndex >= state.total) {
    await setOrchestratorState({ ...state, status: 'done' });
    return;
  }

  if (state.currentTabId !== undefined) {
    await executeOrchestrationStep();
  } else {
    await startNextAccount();
  }
});

// ============================================================================
// Helpers
// ============================================================================

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let stabilityTimer: ReturnType<typeof setTimeout> | null = null;
    const mainTimer = setTimeout(() => { cleanup(); resolve(); }, timeoutMs);

    const cleanup = () => {
      clearTimeout(mainTimer);
      if (stabilityTimer) clearTimeout(stabilityTimer);
      chrome.tabs.onUpdated.removeListener(listener);
    };

    const listener = (updatedId: number, info: { status?: string }) => {
      if (updatedId !== tabId) return;
      if (stabilityTimer) clearTimeout(stabilityTimer);
      if (info.status === 'complete') {
        stabilityTimer = setTimeout(() => { cleanup(); resolve(); }, 800);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function captureTabScreenshot(tabId: number): Promise<string | null> {
  try {
    // Firefox: captureTab captures any tab by ID regardless of focus state — use it directly.
    const gBrowser = (globalThis as Record<string, unknown>)['browser'] as
      | { tabs?: { captureTab?: (id: number, opts: object) => Promise<string> } }
      | undefined;
    if (gBrowser?.tabs?.captureTab) {
      return await gBrowser.tabs.captureTab(tabId, { format: 'jpeg', quality: 80 });
    }

    // Chrome: captureVisibleTab ONLY captures the currently active tab in the window.
    // Re-activate the tab and focus its window before capturing, otherwise any tab
    // that stole focus (e.g. the popup, another tab) would cause this to fail silently.
    const tab = await chrome.tabs.get(tabId);
    if (!tab.windowId) return null;
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    await new Promise(r => setTimeout(r, 300));   // wait for render

    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 });
  } catch (error) {
    console.error('AutoLogin: Screenshot failed:', error);
    return null;
  }
}

interface SuccessLogEntry {
  accountId: string;
  hostname: string;
  url: string;
  username: string;
  timestamp: string;
  cookiesCount: number;
}

// Records a success entry WITHOUT credentials or cookie values in storage.
// Cookies are already persisted encrypted in IndexedDB via cookieStore.saveCookies.
// Plaintext file downloads are intentionally removed — use the popup Export button instead.
async function recordSuccess(
  accountId: string, url: string, username: string,
  cookies: chrome.cookies.Cookie[]
): Promise<void> {
  const hostname = new URL(url).hostname;
  const ts = new Date().toISOString();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stored = await new Promise<any>(res => chrome.storage.local.get('successLog', res));
    const log: SuccessLogEntry[] = (stored['successLog'] as SuccessLogEntry[]) || [];
    log.push({ accountId, hostname, url, username, timestamp: ts, cookiesCount: cookies.length });
    if (log.length > 500) log.shift();
    await new Promise<void>(res => chrome.storage.local.set({ successLog: log }, res));
  } catch { /* non-fatal */ }
}

async function clearBrowserCookiesFor(url: string): Promise<void> {
  const cookies = await new Promise<chrome.cookies.Cookie[]>(res => chrome.cookies.getAll({ url }, res));
  for (const c of cookies) {
    const scheme = c.secure ? 'https' : 'http';
    const domain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
    await new Promise<void>(res => chrome.cookies.remove({ url: `${scheme}://${domain}${c.path}`, name: c.name }, () => res()));
  }
}

function d<T>(data: unknown): T { return data as T; }

// ============================================================================
// Account grouping
// ============================================================================

function groupAndSort(
  creds: Array<{ id: string; url: string; username: string; password: string }>
): OrchestratorAccount[] {
  const groups = new Map<string, OrchestratorAccount[]>();
  for (const c of creds) {
    let hostname: string;
    try { hostname = new URL(c.url).hostname; } catch { hostname = c.url; }
    if (!groups.has(hostname)) groups.set(hostname, []);
    groups.get(hostname)!.push({ ...c, hostname });
  }
  const result: OrchestratorAccount[] = [];
  for (const accs of groups.values()) result.push(...accs);
  return result;
}

// ============================================================================
// Core orchestration
// ============================================================================

async function startNextAccount(): Promise<void> {
  const state = await getOrchestratorState();
  if (!state || state.status !== 'running') return;

  if (state.currentIndex >= state.total) {
    await setOrchestratorState({ ...state, status: 'done' });
    return;
  }

  const account = state.accounts[state.currentIndex];

  // Close any leftover tab
  if (state.currentTabId !== undefined) {
    await chrome.tabs.remove(state.currentTabId).catch(() => {});
  }

  // Clear cookies
  await clearBrowserCookiesFor(account.url).catch(() => {});
  await new Promise(r => setTimeout(r, 500));

  await appendToAiFeed({
    accountId: account.id, username: account.username, hostname: account.hostname,
    commentary: `Starting login for ${account.username} at ${account.hostname}`,
    action: 'start', timestamp: Date.now()
  });

  // Open ACTIVE tab — required for captureVisibleTab
  const tab = await new Promise<chrome.tabs.Tab>((res, rej) =>
    chrome.tabs.create({ url: account.url, active: true }, t => {
      if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
      else res(t);
    })
  );

  const tabId = tab.id!;

  await setOrchestratorState({
    ...state,
    currentTabId: tabId,
    currentSteps: [],
    pendingInstruction: state.pendingInstruction
  });

  // Schedule BEFORE the long wait: if SW is killed during page load,
  // the alarm fires ~27s later and executeOrchestrationStep re-reads state,
  // sees the tab is open, takes a fresh screenshot, and continues.
  chrome.alarms.create('batch_tick', { delayInMinutes: 0.45 });

  await waitForTabComplete(tabId, 20000);
  await new Promise(r => setTimeout(r, 1000));

  // Still alive — replace safety-net with immediate tick
  chrome.alarms.create('batch_tick', { delayInMinutes: 0.05 });
}

async function executeOrchestrationStep(): Promise<void> {
  const state = await getOrchestratorState();
  if (!state || state.status !== 'running' || state.currentTabId === undefined) return;

  const account = state.accounts[state.currentIndex];
  const tabId = state.currentTabId;

  // Max steps guard — prevents infinite loops
  if (state.currentSteps.length >= 18) {
    await handleAccountResult(state, account, tabId, 'FORM_NOT_FOUND', 'Max steps (18) reached without success');
    return;
  }

  // Check tab still exists (may be gone after SW restart)
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) {
    await setOrchestratorState({ ...state, currentTabId: undefined });
    chrome.alarms.create('batch_tick', { delayInMinutes: 0.05 });
    return;
  }

  // Screenshot
  const screenshot = await captureTabScreenshot(tabId);
  if (!screenshot) {
    await appendToAiFeed({
      accountId: account.id, username: account.username, hostname: account.hostname,
      commentary: 'Cannot capture screenshot — skipping this account',
      action: 'error', timestamp: Date.now()
    });
    await handleAccountResult(state, account, tabId, 'FORM_NOT_FOUND', 'Screenshot unavailable');
    return;
  }

  // Build AI context
  const hints = await getSiteHintsForUrl(account.url);
  const template = state.templates[account.hostname];
  const context: ActionContext = {
    username: account.username,
    stepHistory: state.currentSteps,
    hints,
    template,
    instruction: state.pendingInstruction
  };

  // Ask AI for next action
  const currentUrl = tab.url ?? account.url;
  const decision = await decideNextAction(screenshot, currentUrl, context);

  if (!decision) {
    await appendToAiFeed({
      accountId: account.id, username: account.username, hostname: account.hostname,
      commentary: 'AI unavailable — skipping',
      action: 'error', timestamp: Date.now()
    });
    await handleAccountResult(state, account, tabId, 'FORM_NOT_FOUND', 'AI decision unavailable');
    return;
  }

  // Write to feed
  await appendToAiFeed({
    accountId: account.id, username: account.username, hostname: account.hostname,
    commentary: decision.commentary,
    action: decision.action, timestamp: Date.now()
  });

  console.log(`AutoLogin AI [${account.username}@${account.hostname}]: ${decision.action} — ${decision.commentary}`);

  // Terminal actions
  if (decision.action === 'report_success') {
    await handleAccountSuccess(state, account, tabId);
    return;
  }
  if (decision.action === 'report_failure') {
    await handleAccountResult(state, account, tabId, 'WRONG_PASSWORD', decision.commentary);
    return;
  }
  if (decision.action === 'report_captcha') {
    await handleCaptchaPause(state, account, tabId);
    return;
  }

  // Execute action
  let actionOk = false;
  try {
    if (decision.action === 'wait') {
      await new Promise(r => setTimeout(r, decision.waitMs ?? 2000));
      actionOk = true;
    } else if ((decision.action === 'type' || decision.action === 'click') && decision.selector) {
      // Schedule safety-net BEFORE long awaits: if SW dies during sendToContent (10s)
      // or waitForTabComplete (12s), the alarm fires ~27s later and re-enters the step
      // loop — fresh screenshot, AI re-evaluates from actual page state.
      chrome.alarms.create('batch_tick', { delayInMinutes: 0.45 });

      const resp = await sendToContent(tabId, {
        type: MESSAGE_TYPES.EXECUTE_DOM_ACTION,
        data: { action: decision.action, selector: decision.selector, value: decision.value }
      }, 10000);
      actionOk = resp.success && (resp.data as { executed?: boolean })?.executed !== false;
      if (actionOk && decision.action === 'click') {
        await waitForTabComplete(tabId, 12000);
        await new Promise(r => setTimeout(r, 800));
      }
    }
  } catch {
    actionOk = false;
  }

  const step: StepRecord = {
    action: decision.action,
    selector: decision.selector,
    fieldType: decision.fieldType,
    commentary: decision.commentary,
    result: actionOk ? 'ok' : 'failed',
    timestamp: Date.now()
  };

  await setOrchestratorState({
    ...state,
    currentSteps: [...state.currentSteps, step],
    pendingInstruction: undefined  // consumed
  });

  chrome.alarms.create('batch_tick', { delayInMinutes: 0.05 });
}

async function handleAccountSuccess(
  state: OrchestratorState,
  account: OrchestratorAccount,
  tabId: number
): Promise<void> {
  console.log(`✅ AutoLogin: Success for ${account.username}@${account.hostname}`);

  const liveCookies = await new Promise<chrome.cookies.Cookie[]>(res =>
    chrome.cookies.getAll({ url: account.url }, res)
  );

  await recordSuccess(account.id, account.url, account.username, liveCookies)
    .catch(e => console.warn('AutoLogin: recordSuccess failed:', e));

  const dbCookies: Cookie[] = liveCookies.map(c => ({
    account_id: account.id,
    name: c.name, value: c.value, domain: c.domain, path: c.path,
    expires: c.expirationDate ? c.expirationDate * 1000 : undefined,
    httpOnly: c.httpOnly, secure: c.secure
  }));
  await cookieStore.saveCookies(account.id, dbCookies).catch(() => {});

  // Save login template from this session's successful steps
  const templateActions = state.currentSteps
    .filter(s => (s.action === 'type' || s.action === 'click') && s.result === 'ok' && s.selector)
    .map(s => ({ action: s.action as 'type' | 'click', selector: s.selector!, fieldType: s.fieldType ?? 'other' }));

  const newTemplates = templateActions.length > 0
    ? { ...state.templates, [account.hostname]: { actions: templateActions, savedAt: Date.now() } }
    : state.templates;

  if (templateActions.length > 0) {
    console.log(`AutoLogin: Saved template for ${account.hostname} (${templateActions.length} steps)`);
  }

  // Reset failure count
  const newFailures = { ...state.hostnameFailures, [account.hostname]: 0 };

  await logStore.add({ account_id: account.id, status: 'SUCCESS', timestamp: Date.now() });

  // Attempt logout (non-fatal)
  await sendToContent(tabId, { type: MESSAGE_TYPES.LOGOUT_PAGE, data: { url: account.url } }, 5000)
    .then(() => waitForTabComplete(tabId, 5000))
    .catch(() => {});

  await clearBrowserCookiesFor(account.url).catch(() => {});

  await setOrchestratorState({
    ...state,
    templates: newTemplates,
    hostnameFailures: newFailures,
    currentIndex: state.currentIndex + 1,
    currentTabId: undefined,
    currentSteps: []
  });

  await chrome.tabs.remove(tabId).catch(() => {});

  const delay = Math.max(state.delayBetweenMs, 3000);
  chrome.alarms.create('batch_tick', { delayInMinutes: delay / 60000 });
}

async function handleAccountResult(
  state: OrchestratorState,
  account: OrchestratorAccount,
  tabId: number,
  status: string,
  errorMsg: string
): Promise<void> {
  console.log(`❌ AutoLogin: ${status} for ${account.username}@${account.hostname}: ${errorMsg}`);

  const prevFails = state.hostnameFailures[account.hostname] ?? 0;
  const newFails = prevFails + 1;

  await logStore.add({
    account_id: account.id,
    status: status as LoginStatus,
    timestamp: Date.now(),
    error_message: errorMsg
  });

  // Invoke background failure analysis
  invokeAIForFailure(account, status, errorMsg).catch(() => {});

  // Escalate after 3 consecutive failures on same hostname
  if (newFails >= 3) {
    console.log(`⚠️ AutoLogin: Escalating ${account.hostname} after ${newFails} failures`);
    await appendToAiFeed({
      accountId: account.id, username: account.username, hostname: account.hostname,
      commentary: `3 consecutive failures on ${account.hostname}. Waiting for your instruction to continue.`,
      action: 'escalate', timestamp: Date.now()
    });
    await setOrchestratorState({
      ...state,
      status: 'waiting_instruction',
      hostnameFailures: { ...state.hostnameFailures, [account.hostname]: newFails },
      escalation: { hostname: account.hostname, reason: errorMsg },
      currentTabId: undefined,
      currentSteps: []
    });
    await chrome.tabs.remove(tabId).catch(() => {});
    return;
  }

  await setOrchestratorState({
    ...state,
    hostnameFailures: { ...state.hostnameFailures, [account.hostname]: newFails },
    currentIndex: state.currentIndex + 1,
    currentTabId: undefined,
    currentSteps: []
  });

  await chrome.tabs.remove(tabId).catch(() => {});

  const delay = Math.max(state.delayBetweenMs, 3000);
  chrome.alarms.create('batch_tick', { delayInMinutes: delay / 60000 });
}

async function handleCaptchaPause(
  state: OrchestratorState,
  account: OrchestratorAccount,
  tabId: number
): Promise<void> {
  console.log(`⏸️ AutoLogin: CAPTCHA pause for ${account.username}`);
  await appendToAiFeed({
    accountId: account.id, username: account.username, hostname: account.hostname,
    commentary: 'CAPTCHA detected — solve it in the tab then click Continue',
    action: 'captcha_pause', timestamp: Date.now()
  });
  await setOrchestratorState({ ...state, status: 'captcha_pause', currentTabId: tabId });
  await chrome.storage.local.set({
    captchaPause: { username: account.username, url: account.url, tabId, timestamp: Date.now() }
  });
}

async function invokeAIForFailure(account: OrchestratorAccount, status: string, errorMsg: string): Promise<void> {
  const context: LoginContext = {
    credential: { url: account.url, username: account.username, password: account.password },
    status: status as LoginStatus, error: errorMsg, pageUrl: account.url, attemptNumber: 1
  };
  const resp = await analyzeLoginFailure(context);
  logAIInteraction(account.id, context, resp);
  if (resp.success) {
    await chrome.storage.local.set({
      [`ai_insight_${account.id}`]: {
        diagnosis: resp.diagnosis, recommendations: resp.recommendations,
        shouldRetry: resp.shouldRetry, urgency: resp.urgency, confidence: resp.confidence,
        timestamp: Date.now()
      }
    });
  }
}

// ============================================================================
// Credential CRUD Handlers (unchanged from previous version)
// ============================================================================

registerHandler(MESSAGE_TYPES.GET_CREDENTIALS, async (_data, _sender) => {
  try {
    const credentials = await credentialStore.getAll();
    return createResponse<GetCredentialsResponse>({ credentials });
  } catch (error) {
    return createErrorResponse(`Failed to fetch credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.ADD_CREDENTIAL, async (rawData, _sender) => {
  try {
    const data = d<{ url?: string; username?: string; password?: string; password_encrypted?: string; notes?: string }>(rawData);
    if (!data?.url || !data?.username || (!data?.password && !data?.password_encrypted)) {
      return createErrorResponse('Missing required fields: url, username, password');
    }
    const id = await credentialStore.add({
      url: data.url, username: data.username,
      password: data.password || data.password_encrypted || '', notes: data.notes
    });
    return createResponse({ id, success: true });
  } catch (error) {
    return createErrorResponse(`Failed to add credential: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.UPDATE_CREDENTIAL, async (rawData, _sender) => {
  try {
    const data = d<{ id?: string | number; updates?: Record<string, unknown> }>(rawData);
    if (!data?.id || !data?.updates) return createErrorResponse('Missing required fields: id, updates');
    await credentialStore.update(String(data.id), data.updates as Partial<import('@/types/index').Credential>);
    const credential = await credentialStore.getById(String(data.id));
    if (!credential) return createErrorResponse('Credential not found after update');
    return createResponse({ credential });
  } catch (error) {
    return createErrorResponse(`Failed to update credential: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.DELETE_CREDENTIAL, async (rawData, _sender) => {
  try {
    const data = d<{ id?: string | number }>(rawData);
    if (!data?.id) return createErrorResponse('Missing required field: id');
    await credentialStore.delete(String(data.id));
    return createResponse({ deleted: true });
  } catch (error) {
    return createErrorResponse(`Failed to delete credential: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// ============================================================================
// Login State Handlers
// ============================================================================

registerHandler(MESSAGE_TYPES.START_LOGIN, async (rawData, _sender) => {
  try {
    const data = d<{ accountId?: string; url?: string }>(rawData);
    if (!data?.accountId || !data?.url) return createErrorResponse('Missing required fields: accountId, url');
    const loginId = `login_${Date.now()}`;
    loginState.set(loginId, { accountId: data.accountId, startTime: Date.now(), status: 'IN_PROGRESS' });
    return createResponse<StartLoginResponse>({ loginId, status: 'IN_PROGRESS' as LoginStatus });
  } catch (error) {
    return createErrorResponse(`Failed to start login: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.STOP_LOGIN, async (rawData, _sender) => {
  try {
    const data = d<{ accountId?: string }>(rawData);
    if (!data?.accountId) return createErrorResponse('Missing required field: accountId');
    let stopped = false;
    for (const [id, st] of loginState.entries()) {
      if (st.accountId === data.accountId) { loginState.delete(id); stopped = true; break; }
    }
    return createResponse<StopLoginResponse>({ stopped });
  } catch (error) {
    return createErrorResponse(`Failed to stop login: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.GET_STATUS, async (_data, _sender) => {
  try {
    if (loginState.size === 0) return createResponse<GetStatusResponse>({ status: 'idle' });
    const entry = loginState.entries().next().value as [string, LoginState] | undefined;
    const state = entry?.[1];
    return createResponse<GetStatusResponse>({
      status: 'logging_in', currentAccountId: state?.accountId, errorMessage: state?.error
    });
  } catch (error) {
    return createResponse<GetStatusResponse>({ status: 'error', errorMessage: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ============================================================================
// Logging Handlers
// ============================================================================

registerHandler(MESSAGE_TYPES.LOG_ATTEMPT, async (rawData, _sender) => {
  try {
    const data = d<{ account_id?: string; status?: string; timestamp?: number; duration_ms?: number; error_message?: string; captcha_type?: string }>(rawData);
    if (!data?.account_id || !data?.status || !data?.timestamp) return createErrorResponse('Missing required fields');
    const logId = await logStore.add({
      account_id: data.account_id, status: data.status as LoginStatus,
      timestamp: data.timestamp, duration_ms: data.duration_ms,
      error_message: data.error_message, captcha_type: data.captcha_type
    });
    return createResponse<LogAttemptResponse>({ logId });
  } catch (error) {
    return createErrorResponse(`Failed to log attempt: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.GET_LOGS, async (rawData, _sender) => {
  try {
    const data = d<{ accountId?: string; limit?: number }>(rawData);
    const logs = data?.accountId
      ? await logStore.getByAccountId(data.accountId, data?.limit ?? 100)
      : await logStore.filter(undefined, undefined, data?.limit ?? 100);
    return createResponse<GetLogsResponse>({ logs });
  } catch (error) {
    return createErrorResponse(`Failed to fetch logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.EXPORT_LOGS, async (rawData, _sender) => {
  try {
    const data = d<{ accountId?: string; format?: string }>(rawData);
    let exportData: string;
    if ((data?.format ?? 'csv') === 'csv') {
      exportData = await logStore.exportAsCSV(data?.accountId);
    } else {
      const logs = data?.accountId
        ? await logStore.getByAccountId(data.accountId, 1000)
        : await logStore.filter(undefined, undefined, 1000);
      exportData = JSON.stringify(logs, null, 2);
    }
    return createResponse<ExportLogsResponse>({ data: exportData });
  } catch (error) {
    return createErrorResponse(`Failed to export logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// ============================================================================
// DB Utility Handlers
// ============================================================================

registerHandler(MESSAGE_TYPES.GET_STATS, async (_data, _sender) => {
  try {
    const stats = await dbUtils.getStats();
    return createResponse<GetStatsResponse>({
      credentials: stats.credentials, cookies: stats.cookies,
      logs: stats.logs, screenshots: stats.screenshots, screenshotSizeBytes: stats.screenshotSizeBytes
    });
  } catch (error) {
    return createErrorResponse(`Failed to get stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.CLEANUP_DB, async (rawData, _sender) => {
  try {
    void d<{ maxAgeDays?: number }>(rawData);
    return createResponse<CleanupDbResponse>({ cleaned: { cookies: 0, logs: 0, screenshots: 0 } });
  } catch (error) {
    return createErrorResponse(`Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// ============================================================================
// Batch / Orchestration Handlers
// ============================================================================

registerHandler(MESSAGE_TYPES.START_BATCH_LOGIN, async (rawData, _sender) => {
  try {
    const data = d<{ delayBetweenMs?: number }>(rawData);
    const credentials = await credentialStore.getAll();
    if (credentials.length === 0) return createErrorResponse('No credentials to process');

    const rawCreds = credentials.map(c => ({ id: c.id!, url: c.url, username: c.username, password: c.password! }));
    const accounts = groupAndSort(rawCreds);

    const state: OrchestratorState = {
      status: 'running',
      accounts,
      currentIndex: 0,
      total: accounts.length,
      startedAt: Date.now(),
      delayBetweenMs: data?.delayBetweenMs ?? 3000,
      templates: {},
      hostnameFailures: {},
      currentSteps: []
    };

    await setOrchestratorState(state);
    await chrome.storage.local.set({ ai_feed: [] });  // clear feed on new batch
    await startNextAccount();

    return createResponse<StartBatchLoginResponse>({ started: true });
  } catch (error) {
    return createErrorResponse(`Failed to start batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.STOP_BATCH_LOGIN, async (_data, _sender) => {
  try {
    chrome.alarms.clear('batch_tick');
    const state = await getOrchestratorState();
    if (state) {
      if (state.currentTabId !== undefined) await chrome.tabs.remove(state.currentTabId).catch(() => {});
      await setOrchestratorState({ ...state, status: 'stopped' });
    }
    return createResponse({ stopped: true });
  } catch (error) {
    return createErrorResponse(`Failed to stop batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.RESUME_BATCH_LOGIN, async (_data, _sender) => {
  try {
    const state = await getOrchestratorState();
    if (!state || state.status !== 'captcha_pause') return createErrorResponse('No paused batch to resume');

    await setOrchestratorState({
      ...state,
      status: 'running',
      currentIndex: state.currentIndex + 1,
      currentTabId: undefined,
      currentSteps: []
    });
    await chrome.storage.local.remove('captchaPause');
    chrome.alarms.create('batch_tick', { delayInMinutes: 0.05 });

    return createResponse<ResumeBatchLoginResponse>({ resumed: true });
  } catch (error) {
    return createErrorResponse(`Failed to resume batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.USER_INSTRUCTION, async (rawData, _sender) => {
  try {
    const data = d<{ instruction?: string }>(rawData);
    if (!data?.instruction?.trim()) return createErrorResponse('Missing instruction');

    const state = await getOrchestratorState();
    if (!state || state.status !== 'waiting_instruction') return createErrorResponse('Not waiting for instruction');

    const escalatedHostname = state.escalation?.hostname ?? '';

    await appendToAiFeed({
      accountId: 'user', username: 'You', hostname: escalatedHostname,
      commentary: `"${data.instruction}" — Resuming...`,
      action: 'user_instruction', timestamp: Date.now()
    });

    await setOrchestratorState({
      ...state,
      status: 'running',
      pendingInstruction: data.instruction,
      escalation: undefined,
      // Reset failure count for escalated hostname so it gets 3 more attempts
      hostnameFailures: { ...state.hostnameFailures, [escalatedHostname]: 0 }
    });

    chrome.alarms.create('batch_tick', { delayInMinutes: 0.05 });
    return createResponse({ resumed: true });
  } catch (error) {
    return createErrorResponse(`Failed to process instruction: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.GET_BATCH_STATUS, async (_data, _sender) => {
  try {
    const state = await getOrchestratorState();
    if (!state) return createResponse<BatchProgress>({ total: 0, completed: 0, status: 'idle' });

    const current = state.currentIndex < state.total
      ? `${state.accounts[state.currentIndex].username} @ ${state.accounts[state.currentIndex].hostname}`
      : undefined;

    const feedResult = await chrome.storage.local.get('ai_feed');
    const feed = (feedResult['ai_feed'] as AiFeedEntry[]) ?? [];
    const latest = feed[feed.length - 1];

    return createResponse<BatchProgress>({
      total: state.total,
      completed: state.currentIndex,
      current,
      currentUrl: state.currentIndex < state.total ? state.accounts[state.currentIndex].url : undefined,
      status: state.status,
      aiCommentary: latest?.commentary,
      escalationReason: state.escalation?.reason,
      escalationHostname: state.escalation?.hostname
    });
  } catch (error) {
    return createErrorResponse(`Failed to get batch status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// ============================================================================
// File / Cookie Handlers
// ============================================================================

registerHandler(MESSAGE_TYPES.SAVE_SUCCESS_FILE, async (_rawData, _sender) => {
  // Deprecated: auto-download of plaintext files removed for security.
  // Use EXPORT_SUCCESS_LOG instead, which is user-triggered from the popup.
  return createResponse<SaveSuccessFileResponse>({ saved: false });
});

registerHandler(MESSAGE_TYPES.EXPORT_SUCCESS_LOG, async (_rawData, _sender) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stored = await new Promise<any>(res => chrome.storage.local.get('successLog', res));
    const log: SuccessLogEntry[] = (stored['successLog'] as SuccessLogEntry[]) || [];

    // For each success entry, load its cookies from IndexedDB
    const rows = await Promise.all(log.map(async entry => {
      const cookies = await cookieStore.loadCookies(entry.accountId).catch(() => []);
      return {
        hostname: entry.hostname,
        url: entry.url,
        username: entry.username,
        timestamp: entry.timestamp,
        cookiesCount: entry.cookiesCount,
        cookies: cookies.map(c => ({
          name: c.name, value: c.value, domain: c.domain,
          path: c.path, expires: c.expires, secure: c.secure, httpOnly: c.httpOnly
        }))
      };
    }));

    return createResponse<ExportSuccessLogResponse>({
      json: JSON.stringify(rows, null, 2),
      count: rows.length
    });
  } catch (error) {
    return createErrorResponse(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.CLEAR_BROWSER_COOKIES, async (rawData, _sender) => {
  try {
    const data = d<{ url: string }>(rawData);
    const allCookies = await new Promise<chrome.cookies.Cookie[]>((res, rej) =>
      chrome.cookies.getAll({ url: data.url }, cookies => {
        if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
        else res(cookies);
      })
    );
    let cleared = 0;
    for (const c of allCookies) {
      const scheme = c.secure ? 'https' : 'http';
      const domain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
      await new Promise<void>(res => chrome.cookies.remove({ url: `${scheme}://${domain}${c.path}`, name: c.name }, () => res()));
      cleared++;
    }
    return createResponse<ClearBrowserCookiesResponse>({ cleared });
  } catch (error) {
    return createErrorResponse(`Failed to clear cookies: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// ============================================================================
// Developer Handlers
// ============================================================================

registerHandler(MESSAGE_TYPES.DEV_GET_LOGS, async (rawData, _sender) => {
  try {
    const data = d<{ limit?: number }>(rawData);
    const logs = await logStore.filter(undefined, undefined, data?.limit ?? 50);
    return createResponse<DevGetLogsResponse>({ logs });
  } catch (error) {
    return createErrorResponse(`Failed to get logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

registerHandler(MESSAGE_TYPES.DEV_CLEAR_DATA, async (_data, _sender) => {
  try {
    await dbUtils.clearAll().catch(() => {});
    await setOrchestratorState(null);
    await chrome.storage.local.remove(['ai_feed', 'captchaPause']);
    return createResponse({ cleared: true });
  } catch (error) {
    return createErrorResponse(`Failed to clear data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

export {};
