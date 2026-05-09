/**
 * Message System Types
 * Typed discriminated union message definitions for all communication between
 * popup, background service worker, and content script
 */

import { Credential, LoginLog, LoginStatus, FormFields, CaptchaDetection } from '../types/index';

/**
 * Standard response envelope for all messages
 */
export interface MessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

/**
 * All message types that can be sent to the background service worker
 * Sent by: popup UI
 */
export type BackgroundMessageType =
  | 'GET_CREDENTIALS'
  | 'ADD_CREDENTIAL'
  | 'UPDATE_CREDENTIAL'
  | 'DELETE_CREDENTIAL'
  | 'START_LOGIN'
  | 'STOP_LOGIN'
  | 'GET_STATUS'
  | 'LOG_ATTEMPT'
  | 'GET_LOGS'
  | 'EXPORT_LOGS'
  | 'GET_STATS'
  | 'CLEANUP_DB'
  | 'SAVE_SUCCESS_FILE'
  | 'CLEAR_BROWSER_COOKIES'
  | 'START_BATCH_LOGIN'
  | 'STOP_BATCH_LOGIN'
  | 'RESUME_BATCH_LOGIN'
  | 'GET_BATCH_STATUS'
  | 'DEV_GET_LOGS'
  | 'DEV_CLEAR_DATA';

/**
 * All message types that can be sent to the content script
 * Sent by: background service worker
 */
export type ContentMessageType =
  | 'DETECT_FORM'
  | 'FILL_FORM'
  | 'SUBMIT_FORM'
  | 'DETECT_CAPTCHA'
  | 'EXECUTE_CAPTCHA'
  | 'CAPTURE_SCREENSHOT'
  | 'GET_PAGE_INFO'
  | 'LOGOUT_PAGE'
  | 'CHECK_LOGIN_STATUS';

/**
 * Message type constants (avoid magic strings)
 */
export const MESSAGE_TYPES = {
  // Background handlers
  GET_CREDENTIALS: 'GET_CREDENTIALS',
  ADD_CREDENTIAL: 'ADD_CREDENTIAL',
  UPDATE_CREDENTIAL: 'UPDATE_CREDENTIAL',
  DELETE_CREDENTIAL: 'DELETE_CREDENTIAL',
  START_LOGIN: 'START_LOGIN',
  STOP_LOGIN: 'STOP_LOGIN',
  GET_STATUS: 'GET_STATUS',
  LOG_ATTEMPT: 'LOG_ATTEMPT',
  GET_LOGS: 'GET_LOGS',
  EXPORT_LOGS: 'EXPORT_LOGS',
  GET_STATS: 'GET_STATS',
  CLEANUP_DB: 'CLEANUP_DB',

  SAVE_SUCCESS_FILE: 'SAVE_SUCCESS_FILE',
  CLEAR_BROWSER_COOKIES: 'CLEAR_BROWSER_COOKIES',
  START_BATCH_LOGIN: 'START_BATCH_LOGIN',
  STOP_BATCH_LOGIN: 'STOP_BATCH_LOGIN',
  RESUME_BATCH_LOGIN: 'RESUME_BATCH_LOGIN',
  GET_BATCH_STATUS: 'GET_BATCH_STATUS',
  DEV_GET_LOGS: 'DEV_GET_LOGS',
  DEV_CLEAR_DATA: 'DEV_CLEAR_DATA',

  // Content handlers
  DETECT_FORM: 'DETECT_FORM',
  FILL_FORM: 'FILL_FORM',
  SUBMIT_FORM: 'SUBMIT_FORM',
  DETECT_CAPTCHA: 'DETECT_CAPTCHA',
  EXECUTE_CAPTCHA: 'EXECUTE_CAPTCHA',
  CAPTURE_SCREENSHOT: 'CAPTURE_SCREENSHOT',
  GET_PAGE_INFO: 'GET_PAGE_INFO',
  LOGOUT_PAGE: 'LOGOUT_PAGE',
  CHECK_LOGIN_STATUS: 'CHECK_LOGIN_STATUS'
} as const;

// ============================================================================
// Background Messages (popup → background)
// ============================================================================

export interface GetCredentialsMessage {
  type: 'GET_CREDENTIALS';
}

export interface AddCredentialMessage {
  type: 'ADD_CREDENTIAL';
  data: Omit<Credential, 'id' | 'created_at'>;
}

export interface UpdateCredentialMessage {
  type: 'UPDATE_CREDENTIAL';
  data: { id: string; updates: Partial<Credential> };
}

export interface DeleteCredentialMessage {
  type: 'DELETE_CREDENTIAL';
  data: { id: string };
}

export interface StartLoginMessage {
  type: 'START_LOGIN';
  data: {
    accountId: string;
    url: string;
    timeout?: number;
    skipCaptcha?: boolean;
  };
}

export interface StopLoginMessage {
  type: 'STOP_LOGIN';
  data: { accountId: string };
}

export interface GetStatusMessage {
  type: 'GET_STATUS';
}

export interface LogAttemptMessage {
  type: 'LOG_ATTEMPT';
  data: Omit<LoginLog, 'id'>;
}

export interface GetLogsMessage {
  type: 'GET_LOGS';
  data: { accountId?: string; limit?: number };
}

export interface ExportLogsMessage {
  type: 'EXPORT_LOGS';
  data: { accountId?: string; format?: 'csv' | 'json' };
}

export interface GetStatsMessage {
  type: 'GET_STATS';
}

export interface CleanupDbMessage {
  type: 'CLEANUP_DB';
  data: { maxAgeDays?: number };
}

export interface SaveSuccessFileMessage {
  type: 'SAVE_SUCCESS_FILE';
  data: { url: string; username: string; password: string; cookies: chrome.cookies.Cookie[]; timestamp: string };
}

export interface ClearBrowserCookiesMessage {
  type: 'CLEAR_BROWSER_COOKIES';
  data: { url: string };
}

export interface StartBatchLoginMessage {
  type: 'START_BATCH_LOGIN';
  data: { delayBetweenMs?: number };
}

export interface StopBatchLoginMessage {
  type: 'STOP_BATCH_LOGIN';
}

export interface ResumeBatchLoginMessage {
  type: 'RESUME_BATCH_LOGIN';
}

export interface GetBatchStatusMessage {
  type: 'GET_BATCH_STATUS';
}

export interface DevGetLogsMessage {
  type: 'DEV_GET_LOGS';
  data?: { limit?: number };
}

export interface DevClearDataMessage {
  type: 'DEV_CLEAR_DATA';
}

/**
 * Union of all background messages
 */
export type BackgroundMessage =
  | GetCredentialsMessage
  | AddCredentialMessage
  | UpdateCredentialMessage
  | DeleteCredentialMessage
  | StartLoginMessage
  | StopLoginMessage
  | GetStatusMessage
  | LogAttemptMessage
  | GetLogsMessage
  | ExportLogsMessage
  | GetStatsMessage
  | CleanupDbMessage
  | SaveSuccessFileMessage
  | ClearBrowserCookiesMessage
  | StartBatchLoginMessage
  | StopBatchLoginMessage
  | ResumeBatchLoginMessage
  | GetBatchStatusMessage
  | DevGetLogsMessage
  | DevClearDataMessage;

// ============================================================================
// Content Messages (background → content)
// ============================================================================

export interface DetectFormMessage {
  type: 'DETECT_FORM';
  data: { url: string; timeout?: number };
}

export interface FillFormMessage {
  type: 'FILL_FORM';
  data: {
    fields: FormFields;
    username: string;
    password: string;
    timeout?: number;
  };
}

export interface SubmitFormMessage {
  type: 'SUBMIT_FORM';
  data: { selector?: string; timeout?: number };
}

export interface DetectCaptchaMessage {
  type: 'DETECT_CAPTCHA';
  data: { timeout?: number };
}

export interface ExecuteCaptchaMessage {
  type: 'EXECUTE_CAPTCHA';
  data: {
    captchaType: 'text' | 'math' | 'image_grid' | 'recaptcha_checkbox' | 'hcaptcha' | 'unknown';
    answer?: string;
    tileIndices?: number[];
    clickCheckbox?: boolean;
    inputSelector?: string;
    checkboxSelector?: string;
  };
}

export interface CaptureScreenshotMessage {
  type: 'CAPTURE_SCREENSHOT';
  data: {
    stage: 'before_login' | 'after_fill' | 'after_submit';
    quality?: number;
  };
}

export interface GetPageInfoMessage {
  type: 'GET_PAGE_INFO';
}

export interface LogoutPageMessage {
  type: 'LOGOUT_PAGE';
  data: { url: string };
}

export interface CheckLoginStatusMessage {
  type: 'CHECK_LOGIN_STATUS';
  data: { originalUrl: string };
}

/**
 * Union of all content messages
 */
export type ContentMessage =
  | DetectFormMessage
  | FillFormMessage
  | SubmitFormMessage
  | DetectCaptchaMessage
  | ExecuteCaptchaMessage
  | CaptureScreenshotMessage
  | GetPageInfoMessage
  | LogoutPageMessage
  | CheckLoginStatusMessage;

// ============================================================================
// Response Types
// ============================================================================

export interface GetCredentialsResponse {
  credentials: Credential[];
}

export interface AddCredentialResponse {
  id: string;
  credential: Credential;
}

export interface UpdateCredentialResponse {
  credential: Credential;
}

export interface DeleteCredentialResponse {
  deleted: boolean;
}

export interface StartLoginResponse {
  loginId: string;
  status: LoginStatus;
}

export interface StopLoginResponse {
  stopped: boolean;
}

export interface GetStatusResponse {
  status: 'idle' | 'logging_in' | 'error';
  currentAccountId?: string;
  errorMessage?: string;
}

export interface LogAttemptResponse {
  logId: string;
}

export interface GetLogsResponse {
  logs: LoginLog[];
}

export interface ExportLogsResponse {
  data: string; // CSV or JSON string
}

export interface GetStatsResponse {
  credentials: number;
  cookies: number;
  logs: number;
  screenshots: number;
  screenshotSizeBytes: number;
}

export interface CleanupDbResponse {
  cleaned: {
    cookies: number;
    logs: number;
    screenshots: number;
  };
}

export interface SaveSuccessFileResponse {
  saved: boolean;
  downloadId?: number;
  filename?: string;
}

export interface ClearBrowserCookiesResponse {
  cleared: number;
}

export interface BatchProgress {
  total: number;
  completed: number;
  current?: string;
  currentUrl?: string;
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'done';
}

export interface StartBatchLoginResponse {
  started: boolean;
}

export interface StopBatchLoginResponse {
  stopped: boolean;
}

export interface ResumeBatchLoginResponse {
  resumed: boolean;
}

export type GetBatchStatusResponse = BatchProgress;

export interface DevGetLogsResponse {
  logs: LoginLog[];
}

export interface DevClearDataResponse {
  cleared: boolean;
}

export interface DetectFormResponse {
  found: boolean;
  kind?: 'EMAIL_STEP' | 'PASSWORD_STEP' | 'FULL_FORM' | 'NOT_FOUND';
  fields?: FormFields;
  error?: string;
}

export interface FillFormResponse {
  success: boolean;
  fieldsMatched: number;
  fieldsFilled: number;
  error?: string;
}

export interface SubmitFormResponse {
  success: boolean;
  error?: string;
}

export interface DetectCaptchaResponse {
  found: boolean;
  detection?: CaptchaDetection;
}

export interface ExecuteCaptchaResponse {
  solved: boolean;
  method: string;
  error?: string;
}

export interface CaptureScreenshotResponse {
  success: boolean;
  size_bytes?: number;
  error?: string;
}

export interface GetPageInfoResponse {
  url: string;
  title: string;
  hasForm: boolean;
}

export interface LogoutPageResponse {
  attempted: boolean;
  method: 'button_click' | 'navigation' | 'failed';
}

export interface CheckLoginStatusResponse {
  status: 'SUCCESS' | 'WRONG_PASSWORD' | 'CAPTCHA_TIMEOUT' | 'FORM_NOT_FOUND' | 'IN_PROGRESS';
  urlChanged: boolean;
  currentUrl: string;
  errorText?: string;
}

// ============================================================================
// Request/Response Mapping
// ============================================================================

/**
 * Maps message types to their response types for type-safe handler returns
 */
export interface MessageResponseMap {
  GET_CREDENTIALS: GetCredentialsResponse;
  ADD_CREDENTIAL: AddCredentialResponse;
  UPDATE_CREDENTIAL: UpdateCredentialResponse;
  DELETE_CREDENTIAL: DeleteCredentialResponse;
  START_LOGIN: StartLoginResponse;
  STOP_LOGIN: StopLoginResponse;
  GET_STATUS: GetStatusResponse;
  LOG_ATTEMPT: LogAttemptResponse;
  GET_LOGS: GetLogsResponse;
  EXPORT_LOGS: ExportLogsResponse;
  GET_STATS: GetStatsResponse;
  CLEANUP_DB: CleanupDbResponse;
  SAVE_SUCCESS_FILE: SaveSuccessFileResponse;
  CLEAR_BROWSER_COOKIES: ClearBrowserCookiesResponse;
  START_BATCH_LOGIN: StartBatchLoginResponse;
  STOP_BATCH_LOGIN: StopBatchLoginResponse;
  RESUME_BATCH_LOGIN: ResumeBatchLoginResponse;
  GET_BATCH_STATUS: GetBatchStatusResponse;
  DEV_GET_LOGS: DevGetLogsResponse;
  DEV_CLEAR_DATA: DevClearDataResponse;
  DETECT_FORM: DetectFormResponse;
  FILL_FORM: FillFormResponse;
  SUBMIT_FORM: SubmitFormResponse;
  DETECT_CAPTCHA: DetectCaptchaResponse;
  EXECUTE_CAPTCHA: ExecuteCaptchaResponse;
  CAPTURE_SCREENSHOT: CaptureScreenshotResponse;
  GET_PAGE_INFO: GetPageInfoResponse;
  LOGOUT_PAGE: LogoutPageResponse;
  CHECK_LOGIN_STATUS: CheckLoginStatusResponse;
}

// ============================================================================
// Timeout Error
// ============================================================================

export class TimeoutError extends Error {
  constructor(message: string = 'Message timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Helper to create a successful response
 */
export function createResponse<T>(data: T, timestamp: number = Date.now()): MessageResponse<T> {
  return {
    success: true,
    data,
    timestamp
  };
}

/**
 * Helper to create an error response
 */
export function createErrorResponse(error: string, timestamp: number = Date.now()): MessageResponse<never> {
  return {
    success: false,
    error,
    timestamp
  };
}
