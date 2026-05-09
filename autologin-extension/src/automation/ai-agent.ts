/**
 * AI Login Agent
 * Uses OpenRouter free-tier vision models to:
 * - Analyze page screenshots and identify form field selectors
 * - Detect and solve text-based CAPTCHAs from screenshots
 * - Diagnose login failures
 */

import type { Credential, LoginStatus } from '@/types/index';

const AI_CONFIG = {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'YOUR_OPENROUTER_API_KEY', // Get a free key at https://openrouter.ai/keys
  // Free vision models in priority order — reliable first, then higher-quality
  visionModels: [
    'baidu/qianfan-ocr-fast:free',      // Fast, reliable, always works
    'google/gemma-4-31b-it:free',       // Better quality when not rate-limited
    'google/gemma-4-26b-a4b-it:free',   // Gemma fallback
    'nvidia/nemotron-nano-12b-v2-vl:free', // Last resort
  ],
  textModel: 'baidu/qianfan-ocr-fast:free',
  timeout: 45000
};

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
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  captchaDetected?: boolean;
  captchaText?: string;
  pageStep?: 'email' | 'password' | 'full' | 'captcha' | 'otp' | 'dashboard' | 'unknown';
}

export async function analyzePageForLogin(screenshotBase64: string, pageUrl: string): Promise<FormFieldsResult> {
  try {
    const prompt = `You are analyzing a browser screenshot of a login page. Look at the page carefully.

Page URL: ${pageUrl}

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
      return { success: false };
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

    return {
      success: true,
      usernameSelector: typeof parsed.usernameSelector === 'string' ? parsed.usernameSelector : undefined,
      passwordSelector: typeof parsed.passwordSelector === 'string' ? parsed.passwordSelector : undefined,
      submitSelector: typeof parsed.submitSelector === 'string' ? parsed.submitSelector : undefined,
      captchaDetected: !!parsed.captchaDetected,
      captchaText: typeof parsed.captchaText === 'string' ? parsed.captchaText : undefined,
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
 * Try a single OpenRouter model with vision input.
 */
async function tryVisionModel(
  model: string,
  prompt: string,
  base64Data: string,
  signal: AbortSignal
): Promise<{ success: boolean; content?: string; error?: string }> {
  const response = await fetch(`${AI_CONFIG.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
      'HTTP-Referer': 'https://autologin-extension',
      'X-Title': 'AutoLogin Extension'
    },
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
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const msg = err?.error?.message || response.statusText;
    return { success: false, error: `${model}: ${response.status} ${msg}` };
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content || '';
  return content ? { success: true, content } : { success: false, error: `${model}: empty response` };
}

/**
 * Call OpenRouter with a screenshot — tries free vision models in order until one succeeds.
 */
async function callAIWithVision(
  prompt: string,
  imageBase64: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  const errors: string[] = [];

  for (const model of AI_CONFIG.visionModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.timeout);

    try {
      const result = await tryVisionModel(model, prompt, base64Data, controller.signal);
      clearTimeout(timeoutId);

      if (result.success) {
        console.log(`AutoLogin AI: Used model ${model}`);
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

  return { success: false, error: `All vision models failed: ${errors.join(' | ')}` };
}

/**
 * Call OpenRouter text model (no vision).
 */
async function callAIText(
  prompt: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.timeout);

    const response = await fetch(`${AI_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
        'HTTP-Referer': 'https://autologin-extension',
        'X-Title': 'AutoLogin Extension'
      },
      body: JSON.stringify({
        model: AI_CONFIG.textModel,
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

export default { analyzePageForLogin, analyzeLoginFailure, logAIInteraction, AI_CONFIG };
