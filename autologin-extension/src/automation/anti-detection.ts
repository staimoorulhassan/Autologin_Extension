/**
 * Task 8: Anti-Detection
 * Handles browser fingerprint spoofing and detection evasion
 */

export interface BrowserFingerprint {
  userAgent: string;
  timezone: string;
  language: string;
  screenResolution: {
    width: number;
    height: number;
  };
  webglRenderer?: string;
}

export class AntiDetection {
  private readonly chromeUserAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];

  private readonly firefoxUserAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];

  private readonly safariUserAgents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ];

  private readonly timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney',
  ];

  private readonly languages = [
    'en-US',
    'en-GB',
    'de-DE',
    'fr-FR',
    'es-ES',
    'it-IT',
    'ja-JP',
    'zh-CN',
    'ko-KR',
  ];

  private readonly screenResolutions = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 2560, height: 1440 },
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
  ];

  private readonly gpuVendors = [
    'ANGLE (Intel HD Graphics)',
    'NVIDIA GeForce GTX 1080',
    'AMD Radeon RX 5700',
    'Intel Iris Xe Graphics',
    'Apple M1',
  ];

  getRandomUserAgent(browser?: 'chrome' | 'firefox' | 'safari'): string {
    if (browser === 'chrome') {
      return this.getRandomItem(this.chromeUserAgents);
    }
    if (browser === 'firefox') {
      return this.getRandomItem(this.firefoxUserAgents);
    }
    if (browser === 'safari') {
      return this.getRandomItem(this.safariUserAgents);
    }

    // Random browser
    const allUAs = [
      ...this.chromeUserAgents,
      ...this.firefoxUserAgents,
      ...this.safariUserAgents,
    ];
    return this.getRandomItem(allUAs);
  }

  getAntiDetectionHeaders(baseHeaders?: Record<string, string>): Record<string, string> {
    const ua = this.getRandomUserAgent();
    const lang = this.getRandomLanguage();

    return {
      ...baseHeaders,
      'User-Agent': ua,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': lang,
      'Accept-Encoding': 'gzip, deflate, br',
      DNT: '1',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      Referer: 'about:blank',
    };
  }

  getRandomScreenResolution(): { width: number; height: number } {
    return this.getRandomItem(this.screenResolutions);
  }

  getRandomTimezone(): string {
    return this.getRandomItem(this.timezones);
  }

  getRandomLanguage(): string {
    return this.getRandomItem(this.languages);
  }

  getRandomFingerprint(seed?: string): BrowserFingerprint {
    // If seed provided, use seeded random for consistency
    const rng = seed ? this.seededRandom(seed) : Math.random;

    const browserIndex = Math.floor(rng() * 3);
    let userAgent: string;
    if (browserIndex === 0) {
      userAgent = this.chromeUserAgents[
        Math.floor(rng() * this.chromeUserAgents.length)
      ];
    } else if (browserIndex === 1) {
      userAgent = this.firefoxUserAgents[
        Math.floor(rng() * this.firefoxUserAgents.length)
      ];
    } else {
      userAgent = this.safariUserAgents[
        Math.floor(rng() * this.safariUserAgents.length)
      ];
    }

    const resIndex = Math.floor(rng() * this.screenResolutions.length);
    const tzIndex = Math.floor(rng() * this.timezones.length);
    const langIndex = Math.floor(rng() * this.languages.length);

    return {
      userAgent,
      timezone: this.timezones[tzIndex],
      language: this.languages[langIndex],
      screenResolution: this.screenResolutions[resIndex],
      webglRenderer: this.gpuVendors[
        Math.floor(rng() * this.gpuVendors.length)
      ],
    };
  }

  getRandomWebGLRenderer(): string {
    return this.getRandomItem(this.gpuVendors);
  }

  getCanvasEvadeScript(): string {
    return `
(function() {
  // Evade canvas fingerprinting detection
  const canvas = HTMLCanvasElement.prototype;
  const originalToDataURL = canvas.toDataURL;
  canvas.toDataURL = function() {
    if (this.width === 280 && this.height === 60) {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }
    return originalToDataURL.apply(this, arguments);
  };
})();
    `.trim();
  }

  getWebGLEvadeScript(): string {
    return `
(function() {
  const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) {
      return 'Intel Inc.';
    }
    if (parameter === 37446) {
      return 'Intel Iris OpenGL Engine';
    }
    return originalGetParameter.apply(this, arguments);
  };
})();
    `.trim();
  }

  getStealthHeaders(): Record<string, string> {
    return {
      'User-Agent': this.getRandomUserAgent(),
      'Accept-Language': this.getRandomLanguage(),
    };
  }

  private getRandomItem<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private seededRandom(seed: string): () => number {
    return () => {
      const x = Math.sin(this.hash(seed)) * 10000;
      return x - Math.floor(x);
    };
  }

  private hash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}
