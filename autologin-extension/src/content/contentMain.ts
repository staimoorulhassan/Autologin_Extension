/**
 * Content Script
 * Injected into target websites for DOM inspection and interaction
 * Uses typed message handlers from the messaging system
 */

import {
  registerHandler,
  dispatchMessage,
  createResponse,
  createErrorResponse,
  MESSAGE_TYPES,
  DetectFormResponse,
  FillFormResponse,
  SubmitFormResponse,
  DetectCaptchaResponse,
  ExecuteCaptchaResponse,
  CaptureScreenshotResponse,
  GetPageInfoResponse,
  LogoutPageResponse,
  CheckLoginStatusResponse
} from '@messaging/index';

console.log('AutoLogin: Content script loaded on', window.location.href);

/**
 * Main message router: dispatch all incoming messages to registered handlers
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('AutoLogin: Content received message', message.type);
  return dispatchMessage(message, sender, sendResponse);
});

/**
 * ============================================================================
 * Form Detection and Filling Handlers
 * ============================================================================
 */

/**
 * DETECT_FORM: Find login form on current page and extract field selectors
 */
// Type-safe data accessor for content message handlers
function cd<T>(data: unknown): T { return data as T; }

registerHandler(MESSAGE_TYPES.DETECT_FORM, async (_data, _sender) => {
  try {
    const { found, kind, fields } = findLoginForm();
    return createResponse<DetectFormResponse>({
      found,
      kind: found ? kind : undefined,
      fields: found ? fields : undefined
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Form detection error: ${message}`);
  }
});

registerHandler(MESSAGE_TYPES.FILL_FORM, async (rawData, _sender) => {
  try {
    const data = cd<{ fields?: { username_selector?: string; password_selector?: string; submit_selector?: string }; username?: string; password?: string }>(rawData);
    if (!data?.fields || !data?.username || !data?.password) {
      return createErrorResponse('Missing required fields: fields, username, password');
    }
    const { fieldsMatched, fieldsFilled } = fillLoginForm(data.fields, data.username, data.password);
    return createResponse<FillFormResponse>({ success: fieldsFilled > 0, fieldsMatched, fieldsFilled });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Form fill error: ${message}`);
  }
});

registerHandler(MESSAGE_TYPES.SUBMIT_FORM, async (rawData, _sender) => {
  try {
    const data = cd<{ selector?: string }>(rawData);
    const selector = data?.selector;
    const success = submitLoginForm(selector);

    return createResponse<SubmitFormResponse>({
      success
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Form submission error: ${message}`);
  }
});

/**
 * ============================================================================
 * CAPTCHA Detection Handler
 * ============================================================================
 */

/**
 * DETECT_CAPTCHA: Detect if page contains a CAPTCHA and identify its type
 */
registerHandler(MESSAGE_TYPES.DETECT_CAPTCHA, async (_data, _sender) => {
  try {
    const detection = detectCaptchaOnPage();

    return createResponse<DetectCaptchaResponse>({
      found: detection.found,
      detection: detection.found ? detection : undefined
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`CAPTCHA detection error: ${message}`);
  }
});

/**
 * EXECUTE_CAPTCHA: Execute AI-determined CAPTCHA solution on the page
 */
registerHandler(MESSAGE_TYPES.EXECUTE_CAPTCHA, async (rawData, _sender) => {
  try {
    if (!rawData) return createErrorResponse('Missing CAPTCHA execution data');
    const data = cd<{ captchaType: string; answer?: string; tileIndices?: number[]; clickCheckbox?: boolean; inputSelector?: string; checkboxSelector?: string }>(rawData);
    const result = await executeCaptchaSolution(data);

    return createResponse<ExecuteCaptchaResponse>({
      solved: result.solved,
      method: result.method,
      error: result.error
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`CAPTCHA execution error: ${message}`);
  }
});

/**
 * ============================================================================
 * Screenshot Handler
 * ============================================================================
 */

/**
 * CAPTURE_SCREENSHOT: Capture current page state as image
 */
registerHandler(MESSAGE_TYPES.CAPTURE_SCREENSHOT, async (rawData, _sender) => {
  try {
    const data = cd<{ stage?: string; quality?: number }>(rawData);
    if (!data?.stage) return createErrorResponse('Missing required field: stage');
    const { success, size_bytes } = await capturePageScreenshot(data.stage as 'before_login' | 'after_fill' | 'after_submit', data.quality);

    return createResponse<CaptureScreenshotResponse>({
      success,
      size_bytes: success ? size_bytes : undefined
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Screenshot capture error: ${message}`);
  }
});

/**
 * ============================================================================
 * Page Info Handler
 * ============================================================================
 */

/**
 * GET_PAGE_INFO: Get current page URL, title, and form presence
 */
registerHandler(MESSAGE_TYPES.GET_PAGE_INFO, async (_data, _sender) => {
  try {
    const hasForm = findLoginForm().found;

    return createResponse<GetPageInfoResponse>({
      url: window.location.href,
      title: document.title,
      hasForm
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Page info error: ${message}`);
  }
});

/**
 * ============================================================================
 * DOM Utilities (Stub Implementations for Now)
 * ============================================================================
 */

/**
 * Find button by text content (case-insensitive)
 */
function findButtonByText(textPatterns: string[], container: Document | HTMLElement = document): HTMLElement | null {
  const buttons = container.querySelectorAll('button, input[type="submit"], a[role="button"]');

  for (const btn of buttons) {
    const btnText = btn.textContent?.trim().toLowerCase() || '';
    const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
    const title = btn.getAttribute('title')?.toLowerCase() || '';
    const dataTestId = btn.getAttribute('data-testid')?.toLowerCase() || '';

    // Check text content first
    for (const pattern of textPatterns) {
      const lowerPattern = pattern.toLowerCase();
      if (btnText.includes(lowerPattern) || ariaLabel.includes(lowerPattern) || title.includes(lowerPattern) || dataTestId.includes(lowerPattern)) {
        return btn as HTMLElement;
      }
    }
  }

  return null;
}

type FormStepKind = 'EMAIL_STEP' | 'PASSWORD_STEP' | 'FULL_FORM' | 'NOT_FOUND';

interface FormStepResult {
  found: boolean;
  kind?: FormStepKind;
  fields?: {
    username_selector?: string;
    password_selector?: string;
    submit_selector?: string;
  };
}

/**
 * Find login form on the page - now handles multi-step flows
 * Returns: EMAIL_STEP (email only), PASSWORD_STEP (password only), FULL_FORM (both), or NOT_FOUND
 */
function findLoginForm(): FormStepResult {
  console.log('AutoLogin: Detecting form');

  // Helper to check if element is visible
  const isVisible = (el: HTMLElement): boolean => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
  };

  // Helper to generate CSS selector for element
  const generateSelector = (el: HTMLElement): string => {
    if (el.id) return `#${el.id}`;
    const inputEl = el as HTMLInputElement;
    if (inputEl.name) return `input[name="${inputEl.name}"]`;
    // Fallback: use tag + type for inputs
    if (el.tagName === 'INPUT') {
      const type = el.getAttribute('type') || 'text';
      return `input[type="${type}"]`;
    }
    return el.tagName;
  };

  // Find visible email/username input
  const emailInputs = Array.from(document.querySelectorAll(
    'input[type="email"], input[type="text"][name*="identifier"], input[name*="email"], input[name*="user"], input[id*="email"], input[id*="identifier"]'
  )) as HTMLInputElement[];

  const usernameInput = emailInputs.find(el => isVisible(el)) || null;

  // Find visible password input
  const passwordInputs = Array.from(document.querySelectorAll(
    'input[type="password"]'
  )) as HTMLInputElement[];

  const passwordInput = passwordInputs.find(el => isVisible(el)) || null;

  // Look for submit button - try multiple strategies
  let submitButton = document.querySelector('button[type="submit"], input[type="submit"]') as HTMLElement | null;

  if (!submitButton) {
    const nextPatterns = ['next', 'continue', 'sign in', 'signin', 'submit', 'enter'];
    submitButton = findButtonByText(nextPatterns);
  }

  // If still not found, look for any visible button near the form inputs
  if (!submitButton && (usernameInput || passwordInput)) {
    const allButtons = Array.from(document.querySelectorAll('button')) as HTMLElement[];
    submitButton = allButtons.find(btn => isVisible(btn)) || null;
  }

  console.log(`AutoLogin: Form detection - username: ${!!usernameInput}, password: ${!!passwordInput}, button: ${!!submitButton}`);

  // Multi-step flow detection
  if (usernameInput && !passwordInput && submitButton) {
    console.log('AutoLogin: Detected EMAIL_STEP (email field only)');
    return {
      found: true,
      kind: 'EMAIL_STEP',
      fields: {
        username_selector: generateSelector(usernameInput)
      }
    };
  }

  if (passwordInput && !usernameInput && submitButton) {
    console.log('AutoLogin: Detected PASSWORD_STEP (password field only)');
    return {
      found: true,
      kind: 'PASSWORD_STEP',
      fields: {
        password_selector: generateSelector(passwordInput)
      }
    };
  }

  if (usernameInput && passwordInput && submitButton) {
    console.log('AutoLogin: Detected FULL_FORM (both fields present)');
    return {
      found: true,
      kind: 'FULL_FORM',
      fields: {
        username_selector: generateSelector(usernameInput),
        password_selector: generateSelector(passwordInput),
        submit_selector: generateSelector(submitButton)
      }
    };
  }

  console.log('AutoLogin: Form not found');
  return { found: false, kind: 'NOT_FOUND' };
}

/**
 * Fill form fields with credentials - now handles partial forms
 * Fills only the fields that exist and are relevant to the step
 */
function fillLoginForm(
  fields: { username_selector?: string; password_selector?: string; submit_selector?: string },
  username: string,
  password: string
): { fieldsMatched: number; fieldsFilled: number } {
  console.log('AutoLogin: Filling form with credentials');

  let fieldsMatched = 0;
  let fieldsFilled = 0;

  const fillField = (selector: string, value: string, label: string): boolean => {
    // Try the provided selector first, then fall back to generic selectors for each field type
    const fallbacks: Record<string, string> = {
      username: 'input[type="email"], input[name="identifier"], input[name="email"], input[name="username"], input[type="text"]',
      password: 'input[type="password"]'
    };
    const el = (document.querySelector(selector) || document.querySelector(fallbacks[label] || selector)) as HTMLInputElement | null;
    if (!el) {
      console.warn(`AutoLogin: Field not found for selector: ${selector}`);
      return false;
    }
    fieldsMatched++;
    try {
      el.focus();
      // Use native input setter to bypass React/Angular controlled inputs
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, value);
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      fieldsFilled++;
      console.log(`✅ AutoLogin: ${label} field filled (selector: ${selector})`);
      return true;
    } catch (e) {
      console.error(`❌ AutoLogin: Failed to fill ${label} field`, e);
      return false;
    }
  };

  // Fill username field if provided
  if (fields.username_selector) {
    fillField(fields.username_selector, username, 'username');
  }

  // Fill password field if provided
  if (fields.password_selector) {
    fillField(fields.password_selector, password, 'password');
  }

  console.log(`AutoLogin: Fields matched: ${fieldsMatched}, filled: ${fieldsFilled}`);
  return { fieldsMatched, fieldsFilled };
}

/**
 * Submit the login form
 */
function submitLoginForm(selector?: string): boolean {
  console.log('AutoLogin: Submitting form');

  try {
    const isVisible = (el: HTMLElement): boolean => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    };

    let submitButton: HTMLElement | null = null;

    // Strategy 0: Use AI-provided selector directly
    if (selector) {
      submitButton = document.querySelector(selector) as HTMLElement | null;
      if (submitButton) console.log(`AutoLogin: Found button via AI selector: "${selector}"`);
    }

    // Strategy 1: Look for buttons with explicit type="submit"
    if (!submitButton) {
      submitButton = document.querySelector('button[type="submit"], input[type="submit"]') as HTMLElement | null;
      if (submitButton) console.log('AutoLogin: Found button with type="submit"');
    }

    // Strategy 2: Look for buttons by text content
    if (!submitButton) {
      const textPatterns = ['next', 'log in', 'sign in', 'login', 'signin', 'submit', 'enter', 'continue'];
      submitButton = findButtonByText(textPatterns);
      if (submitButton) console.log('AutoLogin: Found button by text pattern');
    }

    // Strategy 3: Find within first form
    if (!submitButton) {
      const forms = document.querySelectorAll('form');
      if (forms.length > 0) {
        const firstForm = forms[0] as HTMLFormElement;
        submitButton = firstForm.querySelector('button[type="submit"], input[type="submit"]') as HTMLElement | null;

        // Also check for buttons by text in the form
        if (!submitButton) {
          const textPatterns = ['next', 'log in', 'sign in', 'login', 'signin', 'submit', 'enter', 'continue'];
          submitButton = findButtonByText(textPatterns, firstForm);
        }
        if (submitButton) console.log('AutoLogin: Found button in form');
      }
    }

    // Strategy 4: Find any visible button on page (Google's button may have no text)
    if (!submitButton) {
      console.log('AutoLogin: Searching for any visible button...');
      const allButtons = Array.from(document.querySelectorAll('button')) as HTMLElement[];
      console.log(`AutoLogin: Found ${allButtons.length} total buttons on page`);

      for (const btn of allButtons) {
        if (isVisible(btn)) {
          console.log(`AutoLogin: Found visible button with text: "${btn.textContent?.trim() || '(empty)'}"`);
          submitButton = btn;
          break;
        }
      }
    }

    if (!submitButton) {
      console.error('❌ AutoLogin: Submit button not found after all strategies');
      return false;
    }

    console.log(`AutoLogin: Submitting button with tag: ${submitButton.tagName}`);

    // Try different submission methods
    if (submitButton instanceof HTMLButtonElement || submitButton.tagName === 'BUTTON') {
      console.log('🖱️ AutoLogin: Clicking submit button');
      submitButton.click();
    } else if (submitButton instanceof HTMLInputElement && submitButton.type === 'submit') {
      console.log('🖱️ AutoLogin: Clicking submit input');
      submitButton.click();
    } else {
      // Last resort: find and submit the form
      const form = submitButton.closest('form') as HTMLFormElement | null;
      if (form) {
        console.log('📝 AutoLogin: Submitting form element');
        form.submit();
      } else {
        console.error('❌ AutoLogin: Could not submit form');
        return false;
      }
    }

    console.log('✅ AutoLogin: Form submitted successfully');
    return true;
  } catch (error) {
    console.error('❌ AutoLogin: Error submitting form:', error);
    return false;
  }
}

/**
 * Detect CAPTCHA on page
 */
function detectCaptchaOnPage(): { found: boolean; type?: 'reCAPTCHA-v2' | 'reCAPTCHA-v3' | 'hCaptcha' | 'image-based' | 'text-based'; sitekey?: string; element?: HTMLElement } {
  console.log('AutoLogin: Detecting CAPTCHA');

  // Stub: Check for common CAPTCHA providers
  // - Google reCAPTCHA v2/v3
  // - hCaptcha
  // - Others

  // Check for reCAPTCHA
  const recaptchaV2 = document.querySelector('.g-recaptcha, [data-sitekey]');
  if (recaptchaV2) {
    return {
      found: true,
      type: 'reCAPTCHA-v2',
      sitekey: recaptchaV2.getAttribute('data-sitekey') || undefined,
      element: recaptchaV2 as HTMLElement
    };
  }

  return { found: false };
}

/**
 * Execute AI-determined CAPTCHA solution:
 * - text/math: type the answer into the input field
 * - recaptcha_checkbox: click the "I'm not a robot" checkbox
 * - image_grid/hcaptcha: click the specified tile indices
 */
async function executeCaptchaSolution(data: {
  captchaType: string;
  answer?: string;
  tileIndices?: number[];
  clickCheckbox?: boolean;
  inputSelector?: string;
  checkboxSelector?: string;
}): Promise<{ solved: boolean; method: string; error?: string }> {
  console.log('AutoLogin: Executing CAPTCHA solution, type:', data.captchaType);

  try {
    if (data.captchaType === 'text' || data.captchaType === 'math') {
      if (!data.answer) {
        return { solved: false, method: 'text_fill', error: 'No answer provided' };
      }

      // Try the AI-provided selector first, then fallback to common patterns
      const selectors = [
        data.inputSelector,
        'input[name="captcha"]',
        'input[id*="captcha"]',
        'input[class*="captcha"]',
        'input[placeholder*="captcha" i]',
        'input[type="text"]'
      ].filter(Boolean) as string[];

      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        if (el) {
          el.focus();
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (nativeSetter) nativeSetter.call(el, data.answer);
          else el.value = data.answer;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`✅ AutoLogin: CAPTCHA answer "${data.answer}" typed into ${sel}`);
          return { solved: true, method: 'text_fill' };
        }
      }

      return { solved: false, method: 'text_fill', error: 'CAPTCHA input field not found' };
    }

    if (data.captchaType === 'recaptcha_checkbox') {
      // Try to click the reCAPTCHA checkbox iframe
      const selectors = [
        data.checkboxSelector,
        'iframe[src*="recaptcha"][src*="anchor"]',
        '.recaptcha-checkbox',
        '#recaptcha-anchor',
        '[aria-label="I\'m not a robot"]'
      ].filter(Boolean) as string[];

      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el) {
          if (el.tagName === 'IFRAME') {
            // Can't directly click inside cross-origin iframe, but clicking the container works sometimes
            el.click();
          } else {
            el.click();
          }
          console.log(`✅ AutoLogin: Clicked reCAPTCHA checkbox via ${sel}`);
          return { solved: true, method: 'checkbox_click' };
        }
      }

      return { solved: false, method: 'checkbox_click', error: 'reCAPTCHA checkbox not found' };
    }

    if (data.captchaType === 'image_grid' || data.captchaType === 'hcaptcha') {
      if (!data.tileIndices || data.tileIndices.length === 0) {
        return { solved: false, method: 'tile_click', error: 'No tile indices provided' };
      }

      // Find the image tiles — reCAPTCHA uses table cells, hCaptcha uses li elements
      const tileSelectors = [
        '.rc-imageselect-tile',
        'td.rc-imageselect-tile',
        '.task-image',
        '.hcaptcha-1',
        '[class*="tile"]',
        'li[class*="captcha"]'
      ];

      let tiles: HTMLElement[] = [];
      for (const sel of tileSelectors) {
        const found = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
        if (found.length > 0) {
          tiles = found;
          console.log(`AutoLogin: Found ${tiles.length} CAPTCHA tiles via "${sel}"`);
          break;
        }
      }

      if (tiles.length === 0) {
        return { solved: false, method: 'tile_click', error: 'No CAPTCHA tiles found on page' };
      }

      let clicked = 0;
      for (const idx of data.tileIndices) {
        if (idx >= 0 && idx < tiles.length) {
          tiles[idx].click();
          clicked++;
          console.log(`AutoLogin: Clicked CAPTCHA tile ${idx}`);
          await new Promise(r => setTimeout(r, 300));
        }
      }

      if (clicked === 0) {
        return { solved: false, method: 'tile_click', error: 'Tile indices out of range' };
      }

      // Wait a moment then click the verify/submit button
      await new Promise(r => setTimeout(r, 800));
      const verifyBtn = document.querySelector('#recaptcha-verify-button, .rc-button-default, [aria-label*="verify" i], [aria-label*="submit" i]') as HTMLElement | null;
      if (verifyBtn) {
        verifyBtn.click();
        console.log('AutoLogin: Clicked CAPTCHA verify button');
      }

      return { solved: true, method: 'tile_click' };
    }

    return { solved: false, method: 'unknown', error: `Unsupported CAPTCHA type: ${data.captchaType}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { solved: false, method: 'error', error: msg };
  }
}

/**
 * Capture screenshot of current page
 */
async function capturePageScreenshot(
  stage: 'before_login' | 'after_fill' | 'after_submit',
  _quality: number = 0.8
): Promise<{ success: boolean; size_bytes?: number }> {
  console.log('AutoLogin: Capturing screenshot for stage', stage);

  // Stub: Would use html2canvas or similar to capture page
  // Real implementation would:
  // - Capture viewport or full page
  // - Compress to PNG/JPEG
  // - Calculate size_bytes
  // - Post to background worker for storage

  return { success: false }; // Stub return
}

/**
 * ============================================================================
 * Phase 4: Login Status Detection & Logout
 * ============================================================================
 */

/**
 * CHECK_LOGIN_STATUS: Detect if login was successful
 */
registerHandler(MESSAGE_TYPES.CHECK_LOGIN_STATUS, async (rawData, _sender) => {
  try {
    const data = cd<{ originalUrl?: string }>(rawData);
    const originalUrl = data?.originalUrl ?? '';
    const currentUrl = window.location.href;
    let urlChanged = false;

    // Parse original and current URLs
    let originalHostname = '';
    let originalPathname = '';
    let currentHostname = '';
    let currentPathname = '';

    try {
      const originalUrlObj = new URL(originalUrl);
      const currentUrlObj = new URL(currentUrl);
      originalHostname = originalUrlObj.hostname;
      originalPathname = originalUrlObj.pathname;
      currentHostname = currentUrlObj.hostname;
      currentPathname = currentUrlObj.pathname;
    } catch {
      // URL parsing failed, assume no success
      console.log('AutoLogin: Could not parse URLs for login status check');
      return createResponse<CheckLoginStatusResponse>({
        status: 'IN_PROGRESS',
        urlChanged: false,
        currentUrl
      });
    }

    // STRICT SUCCESS: URL must have changed to a different domain OR different path (not just login → auth)
    // Require BOTH: not on login page AND URL actually changed
    const loginPathPatterns = ['/login', '/signin', '/sign-in', '/auth', '/log-in', '/accounts'];
    const isCurrentlyOnLoginPath = loginPathPatterns.some(p =>
      currentPathname.toLowerCase().includes(p)
    );

    // URL changed if: different hostname OR different pathname AND not still on login path
    const domainChanged = currentHostname !== originalHostname;
    const pathChanged = currentPathname !== originalPathname &&
      !isCurrentlyOnLoginPath &&
      !loginPathPatterns.some(p => currentPathname.toLowerCase().includes(p));

    urlChanged = domainChanged || pathChanged;

    // SUCCESS: URL has meaningfully changed away from the login flow
    if (urlChanged) {
      console.log(`AutoLogin: Login successful - URL changed from ${originalUrl} to ${currentUrl}`);
      return createResponse<CheckLoginStatusResponse>({
        status: 'SUCCESS',
        urlChanged: true,
        currentUrl
      });
    }

    // Heuristic 2: Error indicators on page
    let errorText = '';
    try {
      const errorSelectors = [
        '[role="alert"]',
        '.error',
        '.error-message',
        '.alert-danger',
        '[class*="error"]',
        '[class*="invalid"]',
        '[aria-live="assertive"]'
      ];
      const errorEl = document.querySelector(errorSelectors.join(', '));
      errorText = errorEl?.textContent?.trim() ?? '';
    } catch {
      // If error detection fails, assume no error
      errorText = '';
    }

    const wrongPasswordPhrases = [
      'incorrect',
      'invalid',
      'wrong',
      'does not match',
      'not recognized',
      'failed',
      'no account'
    ];
    const isWrongPassword = wrongPasswordPhrases.some(p =>
      errorText.toLowerCase().includes(p)
    );

    // Heuristic 3: CAPTCHA present
    let captchaPresent = false;
    try {
      captchaPresent = !!(
        document.querySelector('.g-recaptcha, [data-sitekey], .h-captcha')
      );
    } catch {
      captchaPresent = false;
    }

    if (captchaPresent) {
      return createResponse<CheckLoginStatusResponse>({
        status: 'CAPTCHA_TIMEOUT',
        urlChanged,
        currentUrl,
        errorText: 'CAPTCHA detected'
      });
    }

    if (isWrongPassword) {
      return createResponse<CheckLoginStatusResponse>({
        status: 'WRONG_PASSWORD',
        urlChanged,
        currentUrl,
        errorText: errorText || 'Login failed'
      });
    }

    // Default: still in progress
    return createResponse<CheckLoginStatusResponse>({
      status: 'IN_PROGRESS',
      urlChanged,
      currentUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ AutoLogin: Login status check error:', error);
    return createErrorResponse(`Login status check error: ${message}`);
  }
});

/**
 * LOGOUT_PAGE: Attempt to logout from the page
 */
registerHandler(MESSAGE_TYPES.LOGOUT_PAGE, async (rawData, _sender) => {
  try {
    const data = cd<{ url?: string }>(rawData);
    const baseUrl = data?.url ?? window.location.origin;

    // Strategy 1: Click logout button/link
    const logoutSelectors = [
      'a[href*="logout"]',
      'a[href*="sign-out"]',
      'a[href*="signout"]',
      'button[aria-label*="sign out" i]',
      'button[aria-label*="log out" i]',
      '[data-testid*="logout"]',
      '[data-action*="logout"]'
    ];

    for (const sel of logoutSelectors) {
      try {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el) {
          el.click();
          return createResponse<LogoutPageResponse>({
            attempted: true,
            method: 'button_click'
          });
        }
      } catch {
        // continue to next selector
      }
    }

    // Strategy 2: Navigate to /logout or /sign-out
    const origin = new URL(baseUrl).origin;
    const logoutPaths = ['/logout', '/sign-out', '/signout', '/auth/logout'];
    for (const p of logoutPaths) {
      try {
        window.location.href = origin + p;
        return createResponse<LogoutPageResponse>({
          attempted: true,
          method: 'navigation'
        });
      } catch {
        // continue to next path
      }
    }

    // Strategy 3: Failed - non-fatal, cookies cleared by background anyway
    return createResponse<LogoutPageResponse>({
      attempted: false,
      method: 'failed'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(`Logout error: ${message}`);
  }
});

export {};
