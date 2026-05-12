/**
 * AI Login Agent
 * Primary: Pollinations AI (free, no API key required)
 * Fallback: OpenRouter free-tier vision models (requires API key in options)
 */

import type { Credential, LoginStatus } from '@/types/index';

const AI_CONFIG = {
  // Primary: Pollinations — OpenAI-compatible, requires API key
  pollinations: {
    baseUrl: 'https://gen.pollinations.ai/v1',
    visionModel: 'openai',
    textModel: 'openai',
  },
  // Fallback: OpenRouter free tier — requires API key in extension options
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    visionModels: [
      'qwen/qwen2.5-vl-72b-instruct:free',       // best free vision model
      'meta-llama/llama-3.2-90b-vision-instruct:free',
      'google/gemini-2.0-flash-exp:free',
      'google/gemma-3-27b-it:free',
    ],
    textModel: 'meta-llama/llama-3.3-70b-instruct:free',
  },
  timeout: 45000
};

interface StoredSiteHint { hostname: string; hint: string; savedAt: number; }

/** Return user-saved hints matching the given URL's hostname. */
export async function getSiteHintsForUrl(url: string): Promise<string[]> {
  try {
    const hostname = new URL(url).hostname;
    return new Promise(resolve =>
      chrome.storage.local.get('site_hints', r => {
        const all = (r['site_hints'] as StoredSiteHint[]) || [];
        resolve(
          all
            .filter(h => hostname.includes(h.hostname) || h.hostname.includes(hostname))
            .map(h => h.hint)
        );
      })
    );
  } catch {
    return [];
  }
}

/** Load API keys from storage. */
async function getApiKeys(): Promise<{ pollinations: string; openrouter: string }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['pollinations_api_key', 'openrouter_api_key'], (result) => {
      resolve({
        pollinations: (result['pollinations_api_key'] as string) || '',
        openrouter: (result['openrouter_api_key'] as string) || '',
      });
    });
  });
}

export interface LoginContext {
  credential: Credential;
  status: LoginStatus;
  error?: string;
  pageUrl?: string;
  pageTitle?: string;
  htmlSnapshot?: string;
  attemptNumber?: number;
  previousAttempts?: Array<{
    status: LoginStatus;
    error?: string;
    timestamp: number;
  }>;
}

export interface AIAgentResponse {
  success: boolean;
  diagnosis: string;
  recommendations: string[];
  shouldRetry: boolean;
  retryStrategy?: string;
  urgency: 'low' | 'medium' | 'high';
  confidence: number;
}

/**
 * Vision-based form field detection.
 * Takes a base64 screenshot of the page and returns CSS selectors for all login fields.
 */
export interface FormFieldsResult {
  success: boolean;
  error?: string;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  captchaDetected?: boolean;
  captchaText?: string;
  pageStep?: 'email' | 'password' | 'full' | 'captcha' | 'otp' | 'dashboard' | 'unknown';
}

export async function analyzePageForLogin(screenshotBase64: string, pageUrl: string): Promise<FormFieldsResult> {
  try {
    const siteHints = await getSiteHintsForUrl(pageUrl);
    const hintsSection = siteHints.length > 0
      ? `\n\nUser-provided site instructions (follow these carefully):\n${siteHints.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
      : '';

    const prompt = `You are analyzing a browser screenshot of a login page. Look at the page carefully.

Page URL: ${pageUrl}${hintsSection}

Tasks:
1. Identify what step this login page is showing: "email" (only email/username input visible), "password" (only password input visible), "full" (both email and password visible), "captcha" (CAPTCHA challenge visible), "dashboard" (user is already logged in - no login form), or "unknown".
2. For each visible input field, provide the best CSS selector to target it (prefer id, then name, then type).
3. For the submit/next button, provide the best CSS selector.
4. If a text CAPTCHA is visible, read and return the text.

Respond ONLY with this JSON (no extra text):
{
  "pageStep": "email|password|full|captcha|dashboard|unknown",
  "usernameSelector": "CSS selector for email/username input or null",
  "passwordSelector": "CSS selector for password input or null",
  "submitSelector": "CSS selector for the submit/next button",
  "captchaDetected": false,
  "captchaText": "text shown in CAPTCHA if any, else null"
}`;

    const response = await callAIWithVision(prompt, screenshotBase64);

    if (!response.success || !response.content) {
      console.warn('AutoLogin AI: Vision call failed:', response.error);
      return { success: false, error: response.error };
    }

    const parsed = parseJSON(response.content);
    if (!parsed) {
      return { success: false };
    }

    console.log('AutoLogin AI: Page analysis result:', parsed);

    const validSteps = ['email', 'password', 'full', 'captcha', 'otp', 'dashboard', 'unknown'] as const;
    type PageStep = typeof validSteps[number];
    const rawStep = parsed.pageStep as string;
    const pageStep: PageStep = validSteps.includes(rawStep as PageStep) ? rawStep as PageStep : 'unknown';

    // Strip AI-returned string literals "null"/"undefined" so callers can rely on truthiness
    const cleanSel = (v: unknown): string | undefined => {
      if (typeof v !== 'string') return undefined;
      const s = v.trim();
      return (s === 'null' || s === 'undefined' || s === 'none' || s === '') ? undefined : s;
    };

    return {
      success: true,
      usernameSelector: cleanSel(parsed.usernameSelector),
      passwordSelector: cleanSel(parsed.passwordSelector),
      submitSelector: cleanSel(parsed.submitSelector),
      captchaDetected: !!parsed.captchaDetected,
      captchaText: typeof parsed.captchaText === 'string' && parsed.captchaText !== 'null' ? parsed.captchaText : undefined,
      pageStep
    };
  } catch (error) {
    console.error('AutoLogin AI: analyzePageForLogin error:', error);
    return { success: false };
  }
}

/**
 * Result from AI CAPTCHA analysis
 */
export interface CaptchaResult {
  success: boolean;
  captchaType: 'text' | 'math' | 'image_grid' | 'recaptcha_checkbox' | 'hcaptcha' | 'unknown';
  // For text/math CAPTCHAs — the answer to type
  answer?: string;
  // For image grid CAPTCHAs — zero-based indices of tiles to click
  tileIndices?: number[];
  // For checkbox reCAPTCHA — just click the checkbox
  clickCheckbox?: boolean;
  // Selector for the CAPTCHA input field (text CAPTCHAs)
  inputSelector?: string;
  // Selector for the checkbox (reCAPTCHA v2)
  checkboxSelector?: string;
  // Can't solve — needs human
  needsHuman?: boolean;
  reason?: string;
}

/**
 * AI-powered CAPTCHA solver using Pollinations vision.
 * Analyzes screenshot, identifies CAPTCHA type, returns solving instructions.
 */
export async function solveCaptcha(screenshotBase64: string, pageUrl: string): Promise<CaptchaResult> {
  try {
    const prompt = `You are analyzing a browser screenshot that contains a CAPTCHA challenge.

Page URL: ${pageUrl}

Carefully examine the CAPTCHA and determine:
1. What TYPE of CAPTCHA is this?
   - "text": A distorted word/letters to type
   - "math": A math problem to solve (e.g., "3 + 5 = ?")
   - "image_grid": A grid of images (e.g., "select all traffic lights") — reCAPTCHA image challenge
   - "recaptcha_checkbox": A simple "I'm not a robot" checkbox (no image challenge)
   - "hcaptcha": hCaptcha image selection challenge
   - "unknown": Cannot determine

2. Based on the type:
   - For "text" or "math": What is the ANSWER to type?
   - For "image_grid" or "hcaptcha": Which tile INDICES (0-based, left-to-right, top-to-bottom) contain the requested object? List all matching tiles.
   - For "recaptcha_checkbox": Just click the checkbox.
   - For "unknown": Mark needsHuman as true.

3. What is the CSS selector for:
   - The text input field (for text/math CAPTCHAs)
   - The checkbox element (for recaptcha_checkbox)

Respond ONLY with this JSON:
{
  "captchaType": "text|math|image_grid|recaptcha_checkbox|hcaptcha|unknown",
  "answer": "the text or math answer, or null",
  "tileIndices": [0, 3, 5],
  "clickCheckbox": false,
  "inputSelector": "CSS selector for input field or null",
  "checkboxSelector": "CSS selector for checkbox or null",
  "needsHuman": false,
  "reason": "brief explanation"
}`;

    const response = await callAIWithVision(prompt, screenshotBase64);

    if (!response.success || !response.content) {
      return { success: false, captchaType: 'unknown', needsHuman: true, reason: 'AI unavailable' };
    }

    const parsed = parseJSON(response.content);
    if (!parsed) {
      return { success: false, captchaType: 'unknown', needsHuman: true, reason: 'Invalid AI response' };
    }

    console.log('AutoLogin AI: CAPTCHA analysis result:', parsed);

    const captchaType = (['text', 'math', 'image_grid', 'recaptcha_checkbox', 'hcaptcha', 'unknown'] as const)
      .includes(parsed.captchaType as CaptchaResult['captchaType'])
      ? parsed.captchaType as CaptchaResult['captchaType']
      : 'unknown';

    return {
      success: true,
      captchaType,
      answer: parsed.answer as string | undefined || undefined,
      tileIndices: Array.isArray(parsed.tileIndices) ? parsed.tileIndices as number[] : undefined,
      clickCheckbox: captchaType === 'recaptcha_checkbox',
      inputSelector: parsed.inputSelector as string | undefined || undefined,
      checkboxSelector: parsed.checkboxSelector as string | undefined || undefined,
      needsHuman: !!parsed.needsHuman,
      reason: parsed.reason as string | undefined || undefined
    };
  } catch (error) {
    console.error('AutoLogin AI: solveCaptcha error:', error);
    return { success: false, captchaType: 'unknown', needsHuman: true, reason: String(error) };
  }
}

/**
 * Analyze login failure and return recommendations.
 */
export async function analyzeLoginFailure(context: LoginContext): Promise<AIAgentResponse> {
  try {
    const prompt = buildAnalysisPrompt(context);
    const response = await callAIText(prompt);

    if (!response.success) {
      return fallbackResponse('Could not reach AI agent');
    }

    return parseAIResponse(response.content || '', context);
  } catch (error) {
    return fallbackResponse('Error analyzing login failure');
  }
}

/**
 * Log AI agent interaction for debugging
 */
export function logAIInteraction(
  credentialId: string,
  _context: LoginContext,
  response: AIAgentResponse
): void {
  console.log(`AutoLogin AI [${credentialId}]:`, {
    diagnosis: response.diagnosis,
    shouldRetry: response.shouldRetry,
    urgency: response.urgency,
    confidence: response.confidence,
    recommendations: response.recommendations
  });
}

/**
 * Call a single vision endpoint (OpenAI-compatible format).
 */
async function tryVisionEndpoint(
  baseUrl: string,
  model: string,
  prompt: string,
  base64Data: string,
  signal: AbortSignal,
  apiKey?: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['HTTP-Referer'] = 'https://autologin-extension';
    headers['X-Title'] = 'AutoLogin Extension';
  }

  console.log(`AutoLogin AI: Calling ${baseUrl}/chat/completions with model=${model}`);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
        ]
      }],
      temperature: 0.1,
      max_tokens: 500
    }),
    signal
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error(`AutoLogin AI: ${model} HTTP ${response.status} from ${baseUrl}:`, errText);
    let msg = response.statusText;
    try { msg = (JSON.parse(errText) as { error?: { message?: string } })?.error?.message || msg; } catch { /* ignore */ }
    return { success: false, error: `${model}: ${response.status} ${msg}` };
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content || '';
  if (!content) console.warn(`AutoLogin AI: ${model} returned empty content, full response:`, data);
  return content ? { success: true, content } : { success: false, error: `${model}: empty response` };
}

/**
 * Call AI with vision — tries Pollinations first, falls back to OpenRouter.
 */
async function callAIWithVision(
  prompt: string,
  imageBase64: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  const errors: string[] = [];
  const keys = await getApiKeys();

  // 1. Try Pollinations (primary — free tier, no API key required)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.timeout);
    const result = await tryVisionEndpoint(
      AI_CONFIG.pollinations.baseUrl,
      AI_CONFIG.pollinations.visionModel,
      prompt, base64Data, controller.signal,
      keys.pollinations  // passes key if configured, empty string otherwise (no auth header)
    );
    clearTimeout(timeoutId);
    if (result.success) {
      console.log('AutoLogin AI: Used Pollinations (primary)');
      return result;
    }
    errors.push(`pollinations: ${result.error}`);
    console.warn('AutoLogin AI: Pollinations failed, trying OpenRouter...', result.error);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`pollinations: ${msg}`);
    console.warn('AutoLogin AI: Pollinations threw:', msg);
  }

  // If Pollinations threw a network error, the device is offline or the endpoint is down —
  // skip all OpenRouter attempts immediately instead of wasting 3+ minutes on timeouts
  if (errors.some(e => e.includes('Failed to fetch') || e.includes('NetworkError') || e.includes('network'))) {
    console.warn('AutoLogin AI: Network unavailable — skipping OpenRouter fallbacks');
    return { success: false, error: `Network unavailable: ${errors[0]}` };
  }

  // 2. Fall back to OpenRouter
  if (!keys.openrouter) {
    return { success: false, error: `No API keys configured. Set a Pollinations or OpenRouter key in Options. Errors: ${errors.join(' | ')}` };
  }

  for (const model of AI_CONFIG.openrouter.visionModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.timeout);
    try {
      const result = await tryVisionEndpoint(
        AI_CONFIG.openrouter.baseUrl,
        model, prompt, base64Data, controller.signal, keys.openrouter
      );
      clearTimeout(timeoutId);
      if (result.success) {
        console.log(`AutoLogin AI: Used OpenRouter fallback model ${model}`);
        return result;
      }
      errors.push(result.error || 'unknown error');
      console.warn(`AutoLogin AI: ${model} failed, trying next...`, result.error);
    } catch (error) {
      clearTimeout(timeoutId);
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${model}: ${msg}`);
      console.warn(`AutoLogin AI: ${model} threw:`, msg);
    }
  }

  return { success: false, error: `All vision providers failed: ${errors.join(' | ')}` };
}

/**
 * Call AI text model — tries Pollinations first, falls back to OpenRouter.
 */
async function callAIText(
  prompt: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  const keys = await getApiKeys();

  // 1. Try Pollinations (primary)
  if (keys.pollinations) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.timeout);

      const response = await fetch(`${AI_CONFIG.pollinations.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keys.pollinations}`
        },
        body: JSON.stringify({
          model: AI_CONFIG.pollinations.textModel,
          messages: [
            { role: 'system', content: 'You are a login troubleshooting expert. Respond in JSON format only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 600
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content || '';
        if (content) {
          console.log('AutoLogin AI: Text via Pollinations (primary)');
          return { success: true, content };
        }
      }
      console.warn('AutoLogin AI: Pollinations text failed, trying OpenRouter...');
    } catch (err) {
      console.warn('AutoLogin AI: Pollinations text threw:', err instanceof Error ? err.message : String(err));
    }
  }

  // 2. Fall back to OpenRouter
  if (!keys.openrouter) {
    return { success: false, error: 'No API keys configured. Set a Pollinations or OpenRouter key in Options.' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.timeout);

    const response = await fetch(`${AI_CONFIG.openrouter.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keys.openrouter}`,
        'HTTP-Referer': 'https://autologin-extension',
        'X-Title': 'AutoLogin Extension'
      },
      body: JSON.stringify({
        model: AI_CONFIG.openrouter.textModel,
        messages: [
          { role: 'system', content: 'You are a login troubleshooting expert. Respond in JSON format only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 600
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: `API Error ${response.status}` };
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || '';
    return content ? { success: true, content } : { success: false, error: 'Empty response' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

function parseJSON(content: string): Record<string, unknown> | null {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildAnalysisPrompt(context: LoginContext): string {
  return `Analyze this login failure:
Website: ${context.credential.url}
Username: ${context.credential.username}
Failure: ${context.status}
Error: ${context.error || 'None'}
Attempt: ${context.attemptNumber || 1}

Respond with JSON:
{
  "diagnosis": "reason for failure",
  "recommendations": ["action1", "action2"],
  "shouldRetry": true,
  "urgency": "low|medium|high",
  "confidence": 0.8
}`;
}

function parseAIResponse(content: string, _context: LoginContext): AIAgentResponse {
  const parsed = parseJSON(content);
  if (!parsed) {
    return fallbackResponse('Could not parse AI response');
  }

  return {
    success: true,
    diagnosis: String(parsed.diagnosis || 'Analysis completed'),
    recommendations: Array.isArray(parsed.recommendations)
      ? (parsed.recommendations as string[]).slice(0, 3)
      : ['Retry login'],
    shouldRetry: parsed.shouldRetry !== false,
    retryStrategy: parsed.retryStrategy as string | undefined,
    urgency: (['low', 'medium', 'high'] as const).includes(parsed.urgency as 'low' | 'medium' | 'high')
      ? parsed.urgency as 'low' | 'medium' | 'high'
      : 'medium',
    confidence: typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence as number))
      : 0.5
  };
}

function fallbackResponse(reason: string): AIAgentResponse {
  return {
    success: false,
    diagnosis: reason,
    recommendations: ['Retry login'],
    shouldRetry: true,
    urgency: 'low',
    confidence: 0
  };
}

// ============================================================================
// Per-action AI Orchestration (new architecture)
// ============================================================================

export interface LoginTemplate {
  actions: Array<{ action: 'type' | 'click'; selector: string; fieldType: string }>;
  savedAt: number;
}

export interface ActionContext {
  username: string;
  stepHistory: Array<{ action: string; selector?: string; commentary: string; result: string; fieldType?: string }>;
  hints: string[];
  template?: LoginTemplate;
  instruction?: string;
}

export interface ActionDecision {
  action: 'type' | 'click' | 'wait' | 'report_success' | 'report_failure' | 'report_captcha';
  selector?: string;
  value?: string;
  fieldType?: 'username' | 'password' | 'submit' | 'nav' | 'other';
  waitMs?: number;
  commentary: string;
  confidence: number;
}

/**
 * Decide the single next browser action to progress a login.
 * Called once per AI orchestration step — returns one action at a time.
 */
export async function decideNextAction(
  screenshotBase64: string,
  pageUrl: string,
  context: ActionContext
): Promise<ActionDecision | null> {
  const historyText = context.stepHistory.length > 0
    ? context.stepHistory.slice(-5).map((s, i) =>
        `${i + 1}. ${s.action}${s.selector ? ` [${s.selector}]` : ''} → ${s.result}: ${s.commentary}`
      ).join('\n')
    : '(no previous actions)';

  const templateText = context.template && context.template.actions.length > 0
    ? `\nWorking template from previous successful login on this site:\n${context.template.actions.map(a => `- ${a.action} [${a.selector}] (${a.fieldType})`).join('\n')}`
    : '';

  const hintsText = context.hints.length > 0
    ? `\nUser instructions for this site:\n${context.hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
    : '';

  const instructionText = context.instruction
    ? `\nSpecial user instruction (follow this): ${context.instruction}`
    : '';

  const prompt = `You are a browser automation agent logging into a website as user "${context.username}".

Page URL: ${pageUrl}

Previous actions taken (last 5):
${historyText}${templateText}${hintsText}${instructionText}

Look at the screenshot and decide the SINGLE NEXT ACTION to progress the login.

Respond ONLY with this JSON (no extra text):
{
  "action": "type" | "click" | "wait" | "report_success" | "report_failure" | "report_captcha",
  "selector": "CSS selector (required for type/click, prefer #id over class)",
  "value": "text to type (required for type action only)",
  "fieldType": "username" | "password" | "submit" | "nav" | "other",
  "waitMs": 2000,
  "commentary": "One sentence: what you see and what you are doing",
  "confidence": 0.9
}

Action rules:
- "type": fill an input field (provide selector + value)
- "click": click a button/link/element (provide selector)
- "wait": pause while page loads (provide waitMs)
- "report_success": user is now logged in — dashboard/feed/home visible, no login form
- "report_failure": login clearly failed (wrong password error, account locked)
- "report_captcha": CAPTCHA requires human solving

CRITICAL rules — read these carefully:
- If you see a validation error like "Password can't be blank" or "field is required", the field was NOT filled correctly. You MUST type into that field again before clicking submit — never click submit when a required field shows a blank/empty error.
- If a password field looks empty or shows its placeholder text, type the password into it even if your history says you already typed it. Always trust what you SEE in the screenshot over your history.
- Never click the submit button if any required field appears empty or shows a validation error.

CAPTCHA rules — very important:
- Symbol equation CAPTCHAs: the image shows groups of symbols (triangles, stars, etc.) arranged as a math equation, e.g. "▲▲▲▲▲ - ▲▲ = ?". Count the symbols in EACH group, apply the operator (+, -, ×), and TYPE the numeric result. Example: 5 triangles minus 2 triangles = type "3".
- Counting CAPTCHAs ("Count the symbols", "How many triangles?"): count every symbol visible and TYPE the total number.
- Math CAPTCHAs ("3 + 5 = ?", "12 - 4 = ?"): CALCULATE the answer and TYPE it.
- Text/distorted-word CAPTCHAs: READ the letters and TYPE them.
- Do NOT use report_captcha for any of the above — you can solve all of them by reading the image.
- Only use "report_captcha" for image-SELECTION challenges where a human must click specific image tiles (hCaptcha grids, reCAPTCHA "select all traffic lights").
- After typing a CAPTCHA answer, click the verify/submit button for that CAPTCHA.`;

  try {
    const response = await callAIWithVision(prompt, screenshotBase64);

    if (!response.success || !response.content) {
      console.warn('AutoLogin AI: decideNextAction failed:', response.error);
      return null;
    }

    const parsed = parseJSON(response.content);
    if (!parsed) return null;

    const validActions = ['type', 'click', 'wait', 'report_success', 'report_failure', 'report_captcha'] as const;
    type ActionType = typeof validActions[number];
    const action = validActions.includes(parsed.action as ActionType) ? parsed.action as ActionType : null;
    if (!action) return null;

    const validFieldTypes = ['username', 'password', 'submit', 'nav', 'other'] as const;
    type FieldType = typeof validFieldTypes[number];
    const rawFT = parsed.fieldType as string;
    const fieldType: FieldType = validFieldTypes.includes(rawFT as FieldType) ? rawFT as FieldType : 'other';

    const cleanSel = (v: unknown): string | undefined => {
      if (typeof v !== 'string') return undefined;
      const s = v.trim();
      return (s === 'null' || s === 'undefined' || s === 'none' || s === '') ? undefined : s;
    };

    return {
      action,
      selector: cleanSel(parsed.selector),
      value: typeof parsed.value === 'string' ? parsed.value : undefined,
      fieldType,
      waitMs: typeof parsed.waitMs === 'number' ? parsed.waitMs : 2000,
      commentary: String(parsed.commentary || 'AI action'),
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence as number)) : 0.5
    };
  } catch (error) {
    console.error('AutoLogin AI: decideNextAction error:', error);
    return null;
  }
}

export default { analyzePageForLogin, analyzeLoginFailure, logAIInteraction, decideNextAction, AI_CONFIG };
