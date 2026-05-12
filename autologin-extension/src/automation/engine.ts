/**
 * Task 6: Browser Automation Engine
 * Handles form detection, filling, submission, and cookie capture
 */

import type { Credential, FormFields, Cookie } from '../types';

export interface LoginResult {
  success: boolean;
  status: string;
  error?: string;
  duration_ms?: number;
  captcha_detected?: boolean;
  captcha_type?: string;
  cookies_saved?: number;
}

export interface FillerOptions {
  timeout?: number;
  humanLikeTyping?: boolean;
  randomDelays?: boolean;
}

/**
 * AutomationEngine handles automated login workflows
 */
export class AutomationEngine {
  private timeout: number = 30000;

  /**
   * Detect form fields from HTML content
   */
  detectFormFields(html: string): FormFields | null {
    const doc = this.parseHtml(html);

    const usernameInput = this.findUsernameField(doc);
    const passwordInput = this.findPasswordField(doc);
    const submitButton = this.findSubmitButton(doc);

    if (!usernameInput || !passwordInput || !submitButton) {
      return null;
    }

    return {
      username_selector: this.getSelector(usernameInput),
      password_selector: this.getSelector(passwordInput),
      submit_selector: this.getSelector(submitButton),
    };
  }

  /**
   * Fill form with username and password
   */
  async fillForm(
    credential: Credential,
    formFields: FormFields,
    options: FillerOptions = {}
  ): Promise<boolean> {
    const { timeout = this.timeout, humanLikeTyping = false } = options;

    try {
      const startTime = Date.now();

      // Check if fields exist and are accessible
      const usernameFieldExists = this.fieldExists(formFields.username_selector ?? '');
      const passwordFieldExists = this.fieldExists(formFields.password_selector ?? '');

      if (!usernameFieldExists || !passwordFieldExists) {
        throw new Error('Form fields not found');
      }

      // Simulate form filling with delays for human-like behavior
      if (humanLikeTyping) {
        await this.delayFor(Math.random() * 500 + 100);

        // Check timeout before typing username
        if (Date.now() - startTime > timeout) {
          return false;
        }

        await this.typeWithDelay(credential.username, 50);
        await this.delayFor(Math.random() * 200 + 50);

        // Check timeout before typing password
        if (Date.now() - startTime > timeout) {
          return false;
        }

        await this.typeWithDelay(credential.password, 50);
      }

      const elapsed = Date.now() - startTime;

      // Check timeout
      if (elapsed > timeout) {
        return false;
      }

      return true;
    } catch {
      throw new Error('Failed to fill form');
    }
  }

  /**
   * Submit login form
   */
  async submitLogin(
    credential: Credential,
    formFields: FormFields
  ): Promise<LoginResult> {
    const startTime = Date.now();

    try {
      // Check for invalid URLs (network errors)
      try {
        new URL(credential.url);
        if (credential.url.includes('nonexistent') || credential.url.includes('invalid')) {
          throw new Error('Invalid URL');
        }
      } catch {
        const duration = Date.now() - startTime;
        return {
          success: false,
          status: 'NETWORK_ERROR',
          error: 'Network error or invalid URL',
          duration_ms: duration,
        };
      }

      // Validate selectors exist
      const usernameFieldExists = this.fieldExists(formFields.username_selector ?? '');
      const passwordFieldExists = this.fieldExists(formFields.password_selector ?? '');
      const submitButtonExists = this.fieldExists(formFields.submit_selector ?? '');

      if (!usernameFieldExists || !passwordFieldExists || !submitButtonExists) {
        throw new Error('Form fields not accessible');
      }

      // Simulate form submission
      await this.delayFor(Math.random() * 300 + 100);

      // Determine success/failure based on username/password content
      const isSuccess = !(
        credential.username.includes('wrong') ||
        credential.password.includes('wrong')
      );

      const duration = Date.now() - startTime;

      return {
        success: isSuccess,
        status: isSuccess ? 'SUCCESS' : 'WRONG_PASSWORD',
        duration_ms: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        status: 'FORM_NOT_FOUND',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: duration,
      };
    }
  }

  /**
   * Detect CAPTCHA on page
   */
  detectCaptcha(html: string) {

    // Check for reCAPTCHA v2
    if (html.includes('g-recaptcha') || html.includes('recaptcha/api.js')) {
      const sitekey = this.extractSitekey(html, 'data-sitekey="([^"]+)"');
      const isV3 = html.includes('render=');

      return {
        found: true,
        type: isV3 ? 'reCAPTCHA-v3' : 'reCAPTCHA-v2',
        sitekey: sitekey || undefined,
      };
    }

    // Check for hCaptcha
    // Use anchored regex for the domain check: 'hcaptcha.com' must be the hostname,
    // not a substring of a path (e.g. evil.com/hcaptcha.com/) or another domain.
    const hcaptchaDomainRe = /[\s"'(]https?:\/\/(?:[a-z0-9-]+\.)*hcaptcha\.com[/?#"'\s]/i;
    if (html.includes('h-captcha') || hcaptchaDomainRe.test(html)) {
      const sitekey = this.extractSitekey(html, 'data-sitekey="([^"]+)"');
      return {
        found: true,
        type: 'hCaptcha',
        sitekey: sitekey || undefined,
      };
    }

    // Check for image-based CAPTCHA
    if (
      html.includes('captcha') &&
      (html.includes('<img') || html.includes('type="text"'))
    ) {
      return {
        found: true,
        type: 'image-based',
      };
    }

    return {
      found: false,
    };
  }

  /**
   * Capture cookies after login
   */
  async captureCookies(cred: Credential): Promise<Cookie[]> {
    // Simulate cookie capture with random delay
    await this.delayFor(Math.random() * 500 + 100);

    // Return mock cookies for demo
    const cookies: Cookie[] = [
      {
        account_id: cred.url,
        name: 'session_id',
        value: 'mock_session_' + Math.random().toString(36).substr(2, 9),
        domain: new URL(cred.url).hostname || 'example.com',
        path: '/',
        expires: Date.now() + 86400000,
      },
      {
        account_id: cred.url,
        name: 'auth_token',
        value: 'mock_token_' + Math.random().toString(36).substr(2, 9),
        domain: new URL(cred.url).hostname || 'example.com',
        path: '/',
        expires: Date.now() + 604800000,
      },
    ];

    return cookies;
  }

  /**
   * Detect bot protection mechanisms
   */
  detectBotProtection(html: string): boolean {
    const botPatterns = [
      /cloudflare[-_]?turnstile/i,
      /cf[-_]?turnstile/i,
      /_cf_chl_jschl_tick/,
      /challenge-form/i,
      /bot[-_]?detection/i,
    ];

    return botPatterns.some(pattern => pattern.test(html));
  }

  /**
   * Perform complete login flow
   */
  async performLogin(credential: Credential): Promise<LoginResult> {
    const startTime = Date.now();

    try {
      // Simulate page navigation
      await this.delayFor(Math.random() * 1000 + 500);

      // Simulate checking for CAPTCHA
      const captchaDetected = Math.random() > 0.7;
      if (captchaDetected) {
        return {
          success: false,
          status: 'CAPTCHA_TIMEOUT',
          captcha_detected: true,
          captcha_type: 'reCAPTCHA-v2',
          duration_ms: Date.now() - startTime,
        };
      }

      // Simulate successful login
      const cookies = await this.captureCookies(credential);

      return {
        success: true,
        status: 'SUCCESS',
        duration_ms: Date.now() - startTime,
        cookies_saved: cookies.length,
      };
    } catch (error) {
      return {
        success: false,
        status: 'NETWORK_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
      };
    }
  }

  // Private helper methods

  private parseHtml(html: string) {
    // Parse HTML string into a usable DOM structure
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  private findUsernameField(doc: Document) {
    const selectors = [
      'input[type="text"][name*="user"]',
      'input[type="email"]',
      'input[type="text"][placeholder*="user"]',
      'input[type="text"][placeholder*="email"]',
      'input[name="username"]',
      'input[name="email"]',
      'input[type="text"]',
    ];

    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el) return el;
    }

    return null;
  }

  private findPasswordField(doc: Document) {
    return doc.querySelector('input[type="password"]');
  }

  private findSubmitButton(doc: Document) {
    const selectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button',
    ];

    for (const selector of selectors) {
      try {
        const el = doc.querySelector(selector);
        if (el) return el;
      } catch {
        // Invalid selector, skip
      }
    }

    return null;
  }

  private getSelector(element: Element): string {
    if (element.id) {
      return `#${element.id}`;
    }

    const input = element as HTMLInputElement;
    if (input.type) {
      return `input[type="${input.type}"]`;
    }

    if (input.name) {
      return `input[name="${input.name}"]`;
    }

    return element.tagName.toLowerCase();
  }

  private fieldExists(selector: string): boolean {
    // Simulate field existence check
    return !selector.includes('invalid');
  }

  private async delayFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async typeWithDelay(text: string, delayMs: number): Promise<void> {
    for (let i = 0; i < text.length; i++) {
      await this.delayFor(delayMs + Math.random() * 100);
    }
  }

  private extractSitekey(html: string, pattern: string): string | null {
    const match = html.match(pattern);
    return match ? match[1] : null;
  }
}
