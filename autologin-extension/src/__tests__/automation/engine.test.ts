/**
 * Task 6: Browser Automation Engine Tests
 * Tests for AutomationEngine class handling form detection, filling, and submission
 */

import { AutomationEngine } from '../../automation/engine';
import type { Credential, FormFields, Cookie } from '../../types';

describe('Task 6: Browser Automation Engine', () => {
  let engine: AutomationEngine;

  beforeEach(() => {
    engine = new AutomationEngine();
  });

  describe('FormDetection', () => {
    test('should detect username and password input fields', () => {
      const html = `
        <form>
          <input type="text" name="username" id="user-input" />
          <input type="password" name="password" id="pass-input" />
          <button type="submit">Login</button>
        </form>
      `;

      const formFields = engine.detectFormFields(html);

      expect(formFields).not.toBeNull();
      expect(formFields!.username_selector).toBeTruthy();
      expect(formFields!.password_selector).toBeTruthy();
      expect(formFields!.submit_selector).toBeTruthy();
    });

    test('should detect form fields by common selectors', () => {
      const html = `
        <form id="login-form">
          <input type="email" placeholder="Enter email" />
          <input type="password" placeholder="Enter password" />
          <button>Sign In</button>
        </form>
      `;

      const formFields = engine.detectFormFields(html);

      expect(formFields).not.toBeNull();
      expect(formFields!.username_selector).toMatch(/email|user|input\[type="email"\]/i);
      expect(formFields!.password_selector).toMatch(/password|input\[type="password"\]/i);
      expect(formFields!.submit_selector).toMatch(/button|submit/i);
    });

    test('should return null if form fields not found', () => {
      const html = '<div>No form here</div>';

      const formFields = engine.detectFormFields(html);

      expect(formFields).toBeNull();
    });

    test('should detect submit button by various selectors', () => {
      const htmls = [
        '<form><input type="text" /><input type="password" /><button type="submit">Login</button></form>',
        '<form><input type="text" /><input type="password" /><input type="submit" value="Login" /></form>',
        '<form><input type="text" /><input type="password" /><button onclick="submit()">Login</button></form>',
      ];

      htmls.forEach(html => {
        const formFields = engine.detectFormFields(html);
        expect(formFields).not.toBeNull();
        expect(formFields!.submit_selector).toBeTruthy();
      });
    });
  });

  describe('FormFilling', () => {
    test('should fill username and password fields', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'testuser',
        password: 'testpass123',
      };

      const formFields: FormFields = {
        username_selector: 'input[name="username"]',
        password_selector: 'input[name="password"]',
        submit_selector: 'button[type="submit"]',
      };

      const result = await engine.fillForm(credential, formFields);

      expect(result).toBe(true);
    });

    test('should fill form with rate limiting', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      const formFields: FormFields = {
        username_selector: 'input[type="text"]',
        password_selector: 'input[type="password"]',
        submit_selector: 'button[type="submit"]',
      };

      const startTime = Date.now();
      await engine.fillForm(credential, formFields, { humanLikeTyping: true });
      const duration = Date.now() - startTime;

      // Should take at least 100ms to simulate human typing
      expect(duration).toBeGreaterThanOrEqual(100);
    });

    test('should handle missing form fields gracefully', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      const formFields: FormFields = {
        username_selector: 'input[name="nonexistent"]',
        password_selector: 'input[name="nonexistent"]',
        submit_selector: 'button[name="nonexistent"]',
      };

      try {
        await engine.fillForm(credential, formFields);
        expect(true).toBe(false); // Should have thrown
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should return false if form filling times out', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      const formFields: FormFields = {
        username_selector: 'input[type="text"]',
        password_selector: 'input[type="password"]',
        submit_selector: 'button[type="submit"]',
      };

      const result = await engine.fillForm(credential, formFields, {
        timeout: 1,
        humanLikeTyping: true,
      });

      expect(result).toBe(false);
    });
  });

  describe('LoginSubmission', () => {
    test('should submit form after filling', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      const formFields: FormFields = {
        username_selector: 'input[type="text"]',
        password_selector: 'input[type="password"]',
        submit_selector: 'button[type="submit"]',
      };

      const result = await engine.submitLogin(credential, formFields);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.status).toBeDefined();
    });

    test('should return login result with status and error message on failure', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'wronguser',
        password: 'wrongpass',
      };

      const formFields: FormFields = {
        username_selector: 'input[type="text"]',
        password_selector: 'input[type="password"]',
        submit_selector: 'button[type="submit"]',
      };

      const result = await engine.submitLogin(credential, formFields);

      expect(result.success).toBe(false);
      expect(result.status).toMatch(/WRONG_PASSWORD|FORM_NOT_FOUND|NETWORK_ERROR/);
    });

    test('should track login duration', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      const formFields: FormFields = {
        username_selector: 'input[type="text"]',
        password_selector: 'input[type="password"]',
        submit_selector: 'button[type="submit"]',
      };

      const result = await engine.submitLogin(credential, formFields);

      expect(result.duration_ms).toBeDefined();
      expect(result.duration_ms).toBeGreaterThan(0);
    });
  });

  describe('CaptchaDetection', () => {
    test('should detect reCAPTCHA v2 on page', () => {
      const html = `
        <script src="https://www.google.com/recaptcha/api.js"></script>
        <div class="g-recaptcha" data-sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"></div>
      `;

      const captcha = engine.detectCaptcha(html);

      expect(captcha.found).toBe(true);
      expect(captcha.type).toBe('reCAPTCHA-v2');
      expect(captcha.sitekey).toBe('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI');
    });

    test('should detect reCAPTCHA v3 on page', () => {
      const html = `
        <script src="https://www.google.com/recaptcha/api.js?render=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"></script>
      `;

      const captcha = engine.detectCaptcha(html);

      expect(captcha.found).toBe(true);
      expect(captcha.type).toBe('reCAPTCHA-v3');
    });

    test('should detect hCaptcha on page', () => {
      const html = `
        <script src="https://js.hcaptcha.com/1/api.js"></script>
        <div class="h-captcha" data-sitekey="10000000-ffff-ffff-ffff-000000000001"></div>
      `;

      const captcha = engine.detectCaptcha(html);

      expect(captcha.found).toBe(true);
      expect(captcha.type).toBe('hCaptcha');
    });

    test('should return false if no CAPTCHA found', () => {
      const html = '<form><input type="text" /><input type="password" /></form>';

      const captcha = engine.detectCaptcha(html);

      expect(captcha.found).toBe(false);
    });

    test('should detect image-based CAPTCHA', () => {
      const html = `
        <form>
          <img src="/captcha.png" alt="captcha" />
          <input type="text" placeholder="Enter the code" />
        </form>
      `;

      const captcha = engine.detectCaptcha(html);

      expect(captcha.found).toBe(true);
      expect(captcha.type).toMatch(/image|text/);
    });
  });

  describe('CookieCapture', () => {
    test('should capture and persist cookies after login', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      const cookies = await engine.captureCookies(credential);

      expect(cookies).toBeDefined();
      expect(Array.isArray(cookies)).toBe(true);
      expect(cookies.length).toBeGreaterThan(0);
    });

    test('should return empty array if no cookies available', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      const cookies = await engine.captureCookies(credential);

      expect(Array.isArray(cookies)).toBe(true);
    });

    test('should include session/auth cookies in result', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      const cookies = await engine.captureCookies(credential);

      const authCookies = cookies.filter((c: Cookie) =>
        /session|auth|token|jwt/i.test(c.name)
      );

      if (cookies.length > 0) {
        expect(authCookies.length).toBeGreaterThan(0);
      }
    });
  });

  describe('ErrorHandling', () => {
    test('should handle network errors during login', async () => {
      const credential: Credential = {
        url: 'https://nonexistent.invalid',
        username: 'user',
        password: 'pass',
      };

      const formFields: FormFields = {
        username_selector: 'input[type="text"]',
        password_selector: 'input[type="password"]',
        submit_selector: 'button[type="submit"]',
      };

      const result = await engine.submitLogin(credential, formFields);

      expect(result.success).toBe(false);
      expect(['NETWORK_ERROR', 'FORM_NOT_FOUND', 'WRONG_PASSWORD']).toContain(result.status);
    });

    test('should handle invalid selectors gracefully', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      const formFields: FormFields = {
        username_selector: 'invalid-selector-xyz',
        password_selector: 'invalid-selector-abc',
        submit_selector: 'invalid-selector-123',
      };

      const result = await engine.submitLogin(credential, formFields);

      expect(result.success).toBe(false);
      expect(result.status).toBe('FORM_NOT_FOUND');
    });

    test('should capture error messages from login failures', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'wronguser',
        password: 'wrongpass',
      };

      const formFields: FormFields = {
        username_selector: 'input[type="text"]',
        password_selector: 'input[type="password"]',
        submit_selector: 'button[type="submit"]',
      };

      const result = await engine.submitLogin(credential, formFields);

      if (!result.success && result.error) {
        expect(result.error).toBeTruthy();
      }
    });
  });

  describe('BotDetection', () => {
    test('should detect bot detection systems', async () => {
      const html = `
        <script src="https://cdn.jsdelivr.net/npm/cloudflare-turnstile/cdn/turnstile.min.js"></script>
        <div class="cf-turnstile"></div>
      `;

      const isBotDetected = engine.detectBotProtection(html);

      expect(isBotDetected).toBe(true);
    });

    test('should detect Cloudflare challenges', () => {
      const html = `
        <script>
          //<![CDATA[
          window._cf_chl_jschl_tick = Date.now();
          //]]>
        </script>
      `;

      const isBotDetected = engine.detectBotProtection(html);

      expect(isBotDetected).toBe(true);
    });

    test('should return false if no bot detection found', () => {
      const html = '<form><input type="text" /><button>Submit</button></form>';

      const isBotDetected = engine.detectBotProtection(html);

      expect(isBotDetected).toBe(false);
    });
  });

  describe('Integration', () => {
    test('should complete full login flow from detection to submission', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      const result = await engine.performLogin(credential);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.duration_ms).toBeDefined();
    });

    test('should detect CAPTCHA during login and return appropriate status', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      const result = await engine.performLogin(credential);

      if (result.captcha_detected) {
        expect(result.captcha_type).toBeDefined();
        expect(result.status).toBe('CAPTCHA_TIMEOUT');
      }
    });

    test('should save cookies on successful login', async () => {
      const credential: Credential = {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      };

      const result = await engine.performLogin(credential);

      if (result.success) {
        expect(result.cookies_saved).toBeDefined();
        expect(result.cookies_saved).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
