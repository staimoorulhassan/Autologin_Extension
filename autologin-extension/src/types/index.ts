/**
 * Core type definitions for AutoLogin extension
 */

export interface Credential {
  id?: string;
  url: string;
  username: string;
  password: string;
  password_encrypted?: string;
  created_at?: number;
  last_login?: number;
  last_login_status?: LoginStatus | null;
  notes?: string;
  tags?: string[];
}

export interface Cookie {
  account_id: string;
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  timestamp?: number;
}

export interface LoginLog {
  id?: string;
  account_id: string;
  timestamp: number;
  status: LoginStatus;
  error_message?: string;
  duration_ms?: number;
  captcha_type?: string;
  screenshot_ids?: string[];
}

export interface Screenshot {
  id?: string;
  account_id: string;
  stage: 'before_login' | 'after_fill' | 'after_submit';
  data_url?: string;
  data_blob?: Blob;
  timestamp: number;
  size_bytes: number;
}

export type LoginStatus =
  | 'SUCCESS'
  | 'WRONG_PASSWORD'
  | 'EXPIRED_ACCOUNT'
  | 'CAPTCHA_TIMEOUT'
  | 'CAPTCHA_PAUSED'
  | 'FORM_NOT_FOUND'
  | 'FORM_FILL_FAILED'
  | 'FORM_SUBMIT_FAILED'
  | 'NETWORK_ERROR'
  | 'BLOCKED_BY_BOT_DETECTION'
  | 'IN_PROGRESS';

export interface FormFields {
  username_selector?: string;
  password_selector?: string;
  submit_selector?: string;
}

export interface CaptchaDetection {
  found: boolean;
  type?: 'reCAPTCHA-v2' | 'reCAPTCHA-v3' | 'hCaptcha' | 'image-based' | 'text-based';
  sitekey?: string;
  element?: HTMLElement;
}

export interface BrowserFingerprint {
  userAgent: string;
  timezone: string;
  language: string;
  screenResolution: {
    width: number;
    height: number;
  };
  webglRenderer?: string;
  canvasFingerprint?: string;
  dnt?: string;
  referer?: string;
}

export interface ExtensionConfig {
  encryption_enabled: boolean;
  stealth_mode: boolean;
  auto_solve_captcha: boolean;
  captcha_solver_api?: 'none' | '2captcha' | 'capsolver';
  captcha_api_key?: string;
  cookie_max_age_days: number;
  screenshot_max_age_days: number;
  session_timeout_hours: number;
  log_retention_days: number;
  proxy_rotation_enabled: boolean;
  proxy_list?: string[];
}

export interface MessagePayload<T = any> {
  type: string;
  data?: T;
  error?: string;
  timestamp?: number;
}

export interface FormFillerOptions {
  timeout?: number;
  humanLikeTyping?: boolean;
  randomDelays?: boolean;
}

export interface LoginOptions {
  accountId: string;
  credential: Credential;
  timeout?: number;
  captchaHandler?: 'auto' | 'manual' | 'pause';
}

export interface LoginResult {
  success: boolean;
  status: LoginStatus;
  error?: string;
  duration_ms?: number;
  captcha_detected?: boolean;
  captcha_type?: string;
  cookies_saved?: number;
  screenshots?: string[];
}

export interface Proxy {
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks5';
  username?: string;
  password?: string;
}

export interface LogEntry {
  timestamp: Date;
  logger: string;
  level: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface MonitorMetrics {
  [key: string]: any;
}

export interface Alert {
  id: string;
  ruleName: string;
  severity: string;
  message?: string;
  timestamp: Date;
  acknowledged?: boolean;
  value?: any;
}
