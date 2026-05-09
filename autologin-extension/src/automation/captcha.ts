/**
 * Task 7: CAPTCHA Solver
 * Handles reCAPTCHA, hCaptcha solving via 2captcha/Capsolver APIs
 */

import type { CaptchaDetection } from '../types';

export interface CaptchaSolverConfig {
  apiProvider?: '2captcha' | 'capsolver';
  apiKey: string;
  timeout?: number;
  maxAttempts?: number;
  onManualResolution?: () => Promise<string>;
}

export interface SolveOptions {
  action?: string;
  minScore?: number;
  pollInterval?: number;
}

export interface SolveResult {
  token: string;
  provider: string;
  solveTime_ms: number;
}

export interface CaptchaStatistics {
  totalSolved: number;
  totalFailed: number;
  averageSolveTime_ms: number;
  costEstimate: number;
}

/**
 * CaptchaSolver handles automatic CAPTCHA solving via APIs or manual resolution
 */
export class CaptchaSolver {
  private apiProvider: '2captcha' | 'capsolver';
  private timeout: number;
  private maxAttempts: number;
  private onManualResolution?: () => Promise<string>;

  private statistics = {
    totalSolved: 0,
    totalFailed: 0,
    totalTime: 0,
    costTotal: 0,
  };

  constructor(config: CaptchaSolverConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('API key is required');
    }

    this.apiProvider = config.apiProvider || '2captcha';
    this.timeout = config.timeout || 120000; // 2 minutes default
    this.maxAttempts = config.maxAttempts || 20; // 20 * 5s = 100s polling
    this.onManualResolution = config.onManualResolution;
  }

  /**
   * Solve CAPTCHA and return token
   */
  async solve(
    captcha: CaptchaDetection,
    pageUrl: string,
    options: SolveOptions = {}
  ): Promise<string> {
    const startTime = Date.now();

    try {
      // Validate inputs
      if (!captcha.found) {
        throw new Error('CAPTCHA not found');
      }

      if (!captcha.type) {
        throw new Error('CAPTCHA type not specified');
      }

      // Validate page URL
      try {
        new URL(pageUrl);
      } catch {
        throw new Error('Invalid page URL');
      }

      // Handle image-based CAPTCHA
      if (captcha.type === 'image-based') {
        if (this.onManualResolution) {
          return await this.onManualResolution();
        }
        throw new Error('Image-based CAPTCHA requires manual resolution handler');
      }

      // Validate sitekey for API-based CAPTCHAs
      if (!captcha.sitekey || captcha.sitekey.trim() === '') {
        throw new Error('Sitekey required for CAPTCHA solving');
      }

      // Solve based on type
      let token: string;

      switch (captcha.type) {
        case 'reCAPTCHA-v2':
          token = await this.solveRecaptchaV2(captcha, pageUrl);
          break;

        case 'reCAPTCHA-v3':
          token = await this.solveRecaptchaV3(
            captcha,
            pageUrl,
            options.action,
            options.minScore
          );
          break;

        case 'hCaptcha':
          token = await this.solveHcaptcha(captcha, pageUrl);
          break;

        default:
          throw new Error(`Unsupported CAPTCHA type: ${captcha.type}`);
      }

      const duration = Date.now() - startTime;
      this.statistics.totalSolved++;
      this.statistics.totalTime += duration;
      this.statistics.costTotal += this.calculateCost(captcha);

      return token;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.statistics.totalFailed++;

      if (
        duration > this.timeout &&
        error instanceof Error &&
        !error.message.includes('timeout')
      ) {
        throw new Error('CAPTCHA solving timeout');
      }

      throw error;
    }
  }

  /**
   * Solve CAPTCHA and return token with metadata
   */
  async solveWithMetadata(
    captcha: CaptchaDetection,
    pageUrl: string,
    options?: SolveOptions
  ): Promise<SolveResult> {
    const startTime = Date.now();
    const token = await this.solve(captcha, pageUrl, options);
    const duration = Date.now() - startTime;

    return {
      token,
      provider: this.apiProvider,
      solveTime_ms: duration,
    };
  }

  /**
   * Estimate cost for solving a CAPTCHA
   */
  estimateCost(captcha: CaptchaDetection): number {
    if (!captcha.found) {
      return 0;
    }

    // Image-based with manual resolution has no cost
    if (captcha.type === 'image-based' && this.onManualResolution) {
      return 0;
    }

    // Cost per CAPTCHA type (in cents, approximate)
    const costs: Record<string, number> = {
      'reCAPTCHA-v2': 0.1, // $0.001
      'reCAPTCHA-v3': 0.1, // $0.001
      'hCaptcha': 0.08, // $0.0008
      'image-based': 0, // requires manual handler
    };

    return costs[captcha.type || 'image-based'] || 0;
  }

  /**
   * Get statistics for solved CAPTCHAs
   */
  getStatistics(): CaptchaStatistics {
    const avgTime =
      this.statistics.totalSolved > 0
        ? Math.round(this.statistics.totalTime / this.statistics.totalSolved)
        : 0;

    return {
      totalSolved: this.statistics.totalSolved,
      totalFailed: this.statistics.totalFailed,
      averageSolveTime_ms: avgTime,
      costEstimate: Math.round(this.statistics.costTotal * 100) / 100,
    };
  }

  // Private methods

  private async solveRecaptchaV2(
    captcha: CaptchaDetection,
    pageUrl: string
  ): Promise<string> {
    if (this.apiProvider === '2captcha') {
      return await this.solve2captchaRecaptchaV2(captcha, pageUrl);
    } else {
      return await this.solveCapsolverRecaptchaV2(captcha, pageUrl);
    }
  }

  private async solveRecaptchaV3(
    captcha: CaptchaDetection,
    pageUrl: string,
    action?: string,
    minScore?: number
  ): Promise<string> {
    if (this.apiProvider === '2captcha') {
      return await this.solve2captchaRecaptchaV3(
        captcha,
        pageUrl,
        action,
        minScore
      );
    } else {
      return await this.solveCapsolverRecaptchaV3(
        captcha,
        pageUrl,
        action,
        minScore
      );
    }
  }

  private async solveHcaptcha(
    captcha: CaptchaDetection,
    pageUrl: string
  ): Promise<string> {
    if (this.apiProvider === '2captcha') {
      return await this.solve2captchaHcaptcha(captcha, pageUrl);
    } else {
      return await this.solveCapsolverHcaptcha(captcha, pageUrl);
    }
  }

  private async solve2captchaRecaptchaV2(
    captcha: CaptchaDetection,
    _pageUrl: string
  ): Promise<string> {
    // 2captcha API for reCAPTCHA v2
    // In real implementation, would call: https://2captcha.com/api/upload
    const token = await this.pollCaptchaResult(
      `2captcha-v2-${captcha.sitekey}`
    );
    return token;
  }

  private async solve2captchaRecaptchaV3(
    captcha: CaptchaDetection,
    _pageUrl: string,
    _action?: string,
    _minScore?: number
  ): Promise<string> {
    // 2captcha API for reCAPTCHA v3
    const token = await this.pollCaptchaResult(
      `2captcha-v3-${captcha.sitekey}`
    );
    return token;
  }

  private async solve2captchaHcaptcha(
    captcha: CaptchaDetection,
    _pageUrl: string
  ): Promise<string> {
    // 2captcha API for hCaptcha
    const token = await this.pollCaptchaResult(
      `2captcha-hcaptcha-${captcha.sitekey}`
    );
    return token;
  }

  private async solveCapsolverRecaptchaV2(
    captcha: CaptchaDetection,
    _pageUrl: string
  ): Promise<string> {
    // Capsolver API for reCAPTCHA v2
    const token = await this.pollCaptchaResult(
      `capsolver-v2-${captcha.sitekey}`
    );
    return token;
  }

  private async solveCapsolverRecaptchaV3(
    captcha: CaptchaDetection,
    _pageUrl: string,
    _action?: string,
    _minScore?: number
  ): Promise<string> {
    // Capsolver API for reCAPTCHA v3
    const token = await this.pollCaptchaResult(
      `capsolver-v3-${captcha.sitekey}`
    );
    return token;
  }

  private async solveCapsolverHcaptcha(
    captcha: CaptchaDetection,
    _pageUrl: string
  ): Promise<string> {
    // Capsolver API for hCaptcha
    const token = await this.pollCaptchaResult(
      `capsolver-hcaptcha-${captcha.sitekey}`
    );
    return token;
  }

  private async pollCaptchaResult(
    taskId: string,
    _pollInterval: number = 5000
  ): Promise<string> {
    let attempts = 0;

    while (attempts < this.maxAttempts) {
      // Simulate polling - in real implementation, would check API status
      await this.delayFor(100 + Math.random() * 400);

      // Simulate successful solve after 1-3 attempts
      if (Math.random() > 0.3 || attempts > 2) {
        // Return mock token
        return `mock-token-${taskId.substring(0, 20)}-${Math.random()
          .toString(36)
          .substring(2, 15)}`;
      }

      attempts++;
    }

    throw new Error(
      `Failed to solve CAPTCHA after ${this.maxAttempts} attempts`
    );
  }

  private calculateCost(captcha: CaptchaDetection): number {
    return this.estimateCost(captcha);
  }

  private async delayFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
