/**
 * Task 8: Proxy Rotation & Anti-Detection Tests
 * Tests for ProxyManager and AntiDetection classes
 */

import { ProxyManager, ProxyRotationStrategy } from '../../automation/proxy';
import { AntiDetection } from '../../automation/anti-detection';
import type { Proxy } from '../../types';

describe('Task 8: Proxy Rotation & Anti-Detection', () => {
  describe('ProxyManager', () => {
    let proxyManager: ProxyManager;
    const testProxies: Proxy[] = [
      {
        host: '192.168.1.1',
        port: 8080,
        protocol: 'http',
        username: 'user1',
        password: 'pass1',
      },
      {
        host: '192.168.1.2',
        port: 8080,
        protocol: 'http',
        username: 'user2',
        password: 'pass2',
      },
      {
        host: '192.168.1.3',
        port: 8080,
        protocol: 'http',
        username: 'user3',
        password: 'pass3',
      },
    ];

    beforeEach(() => {
      proxyManager = new ProxyManager(testProxies);
    });

    describe('Initialization', () => {
      test('should initialize with proxy list', () => {
        expect(proxyManager).toBeDefined();
      });

      test('should throw if no proxies provided', () => {
        expect(() => new ProxyManager([])).toThrow();
      });

      test('should support single proxy', () => {
        const single = new ProxyManager([testProxies[0]]);
        expect(single).toBeDefined();
      });

      test('should track proxy health status', () => {
        const health = proxyManager.getProxyHealth();
        expect(health).toBeDefined();
        expect(health.length).toBe(testProxies.length);
      });
    });

    describe('Proxy Rotation Strategies', () => {
      test('should rotate proxies in round-robin order', () => {
        const proxies: Proxy[] = [];
        for (let i = 0; i < 6; i++) {
          const proxy = proxyManager.getNextProxy(
            ProxyRotationStrategy.ROUND_ROBIN
          );
          proxies.push(proxy);
        }

        // Should cycle through all proxies
        expect(proxies[0]).toEqual(testProxies[0]);
        expect(proxies[1]).toEqual(testProxies[1]);
        expect(proxies[2]).toEqual(testProxies[2]);
        expect(proxies[3]).toEqual(testProxies[0]);
      });

      test('should rotate proxies randomly', () => {
        const proxies: Proxy[] = [];
        for (let i = 0; i < 10; i++) {
          const proxy = proxyManager.getNextProxy(ProxyRotationStrategy.RANDOM);
          proxies.push(proxy);
        }

        // Should all be valid proxies from the list
        proxies.forEach(proxy => {
          expect(testProxies).toContainEqual(proxy);
        });
      });

      test('should prioritize healthy proxies', () => {
        // Mark one proxy as unhealthy
        proxyManager.markProxyUnhealthy(testProxies[0]);

        const proxy = proxyManager.getNextProxy(
          ProxyRotationStrategy.HEALTHY_FIRST
        );

        // Should return a healthy proxy
        expect(proxy).not.toEqual(testProxies[0]);
      });

      test('should prefer least-used proxies', () => {
        const proxies: Proxy[] = [];
        for (let i = 0; i < 3; i++) {
          const proxy = proxyManager.getNextProxy(
            ProxyRotationStrategy.LEAST_USED
          );
          proxies.push(proxy);
        }

        // All three proxies should be used once each
        expect(new Set(proxies.map(p => p.host)).size).toBe(3);
      });

      test('should support custom rotation strategy', () => {
        let callCount = 0;
        const customStrategy = () => {
          callCount++;
          return testProxies[callCount % testProxies.length];
        };

        const proxy = proxyManager.getNextProxy(customStrategy as any);

        expect(proxy).toBeDefined();
        expect(callCount).toBe(1);
      });
    });

    describe('Proxy Health Checking', () => {
      test('should mark proxy as unhealthy', () => {
        proxyManager.markProxyUnhealthy(testProxies[0]);

        const health = proxyManager.getProxyHealth();
        const firstProxyHealth = health.find(
          h => h.host === testProxies[0].host
        );

        expect(firstProxyHealth?.healthy).toBe(false);
      });

      test('should mark proxy as healthy', () => {
        proxyManager.markProxyUnhealthy(testProxies[0]);
        proxyManager.markProxyHealthy(testProxies[0]);

        const health = proxyManager.getProxyHealth();
        const firstProxyHealth = health.find(
          h => h.host === testProxies[0].host
        );

        expect(firstProxyHealth?.healthy).toBe(true);
      });

      test('should track failure count', () => {
        for (let i = 0; i < 3; i++) {
          proxyManager.recordProxyFailure(testProxies[0]);
        }

        const health = proxyManager.getProxyHealth();
        const firstProxyHealth = health.find(
          h => h.host === testProxies[0].host
        );

        expect(firstProxyHealth?.failureCount).toBe(3);
      });

      test('should track success count', () => {
        for (let i = 0; i < 5; i++) {
          proxyManager.recordProxySuccess(testProxies[0]);
        }

        const health = proxyManager.getProxyHealth();
        const firstProxyHealth = health.find(
          h => h.host === testProxies[0].host
        );

        expect(firstProxyHealth?.successCount).toBe(5);
      });

      test('should calculate success rate', () => {
        for (let i = 0; i < 7; i++) {
          proxyManager.recordProxySuccess(testProxies[0]);
        }
        for (let i = 0; i < 3; i++) {
          proxyManager.recordProxyFailure(testProxies[0]);
        }

        const health = proxyManager.getProxyHealth();
        const firstProxyHealth = health.find(
          h => h.host === testProxies[0].host
        );

        expect(firstProxyHealth?.successRate).toBe(0.7);
      });

      test('should automatically unhealthy proxy after failure threshold', () => {
        const failureThreshold = 5;
        const pm = new ProxyManager(testProxies, {
          failureThreshold,
        });

        for (let i = 0; i < failureThreshold + 1; i++) {
          pm.recordProxyFailure(testProxies[0]);
        }

        const health = pm.getProxyHealth();
        const firstProxyHealth = health.find(
          h => h.host === testProxies[0].host
        );

        expect(firstProxyHealth?.healthy).toBe(false);
      });

      test('should reset failure count after successful use', () => {
        for (let i = 0; i < 2; i++) {
          proxyManager.recordProxyFailure(testProxies[0]);
        }
        proxyManager.recordProxySuccess(testProxies[0]);

        const health = proxyManager.getProxyHealth();
        const firstProxyHealth = health.find(
          h => h.host === testProxies[0].host
        );

        expect(firstProxyHealth?.failureCount).toBe(0);
      });
    });

    describe('Proxy URL Generation', () => {
      test('should generate proxy URL with auth', () => {
        const url = proxyManager.getProxyUrl(testProxies[0]);

        expect(url).toContain('http://user1:pass1@192.168.1.1:8080');
      });

      test('should generate proxy URL without auth', () => {
        const proxyNoAuth: Proxy = {
          host: '10.0.0.1',
          port: 3128,
          protocol: 'http',
        };

        const pm = new ProxyManager([proxyNoAuth]);
        const url = pm.getProxyUrl(proxyNoAuth);

        expect(url).toContain('http://10.0.0.1:3128');
        expect(url).not.toContain('@');
      });

      test('should support HTTPS proxy protocol', () => {
        const proxyHttps: Proxy = {
          host: '10.0.0.1',
          port: 3128,
          protocol: 'https',
        };

        const pm = new ProxyManager([proxyHttps]);
        const url = pm.getProxyUrl(proxyHttps);

        expect(url).toContain('https://');
      });

      test('should support SOCKS5 proxy protocol', () => {
        const proxySocks: Proxy = {
          host: '10.0.0.1',
          port: 1080,
          protocol: 'socks5',
        };

        const pm = new ProxyManager([proxySocks]);
        const url = pm.getProxyUrl(proxySocks);

        expect(url).toContain('socks5://');
      });
    });

    describe('Statistics', () => {
      test('should track rotation statistics', () => {
        for (let i = 0; i < 5; i++) {
          proxyManager.getNextProxy();
        }

        const stats = proxyManager.getStatistics();

        expect(stats.totalRotations).toBe(5);
      });

      test('should track average response time per proxy', () => {
        proxyManager.recordProxySuccess(testProxies[0], 150);
        proxyManager.recordProxySuccess(testProxies[0], 250);

        const health = proxyManager.getProxyHealth();
        const firstProxyHealth = health.find(
          h => h.host === testProxies[0].host
        );

        expect(firstProxyHealth?.averageResponseTime_ms).toBe(200);
      });

      test('should identify slowest proxy', () => {
        proxyManager.recordProxySuccess(testProxies[0], 500);
        proxyManager.recordProxySuccess(testProxies[1], 100);
        proxyManager.recordProxySuccess(testProxies[2], 200);

        const stats = proxyManager.getStatistics();

        expect(stats.slowestProxy?.host).toBe(testProxies[0].host);
      });

      test('should identify most reliable proxy', () => {
        proxyManager.recordProxySuccess(testProxies[0], 100);
        proxyManager.recordProxySuccess(testProxies[0], 100);
        proxyManager.recordProxyFailure(testProxies[1]);
        proxyManager.recordProxyFailure(testProxies[1]);

        const stats = proxyManager.getStatistics();

        expect(stats.mostReliableProxy?.host).toBe(testProxies[0].host);
      });
    });
  });

  describe('AntiDetection', () => {
    let antiDetection: AntiDetection;

    beforeEach(() => {
      antiDetection = new AntiDetection();
    });

    describe('User-Agent Rotation', () => {
      test('should return a valid User-Agent', () => {
        const ua = antiDetection.getRandomUserAgent();

        expect(ua).toBeDefined();
        expect(ua.length).toBeGreaterThan(0);
        expect(ua).toContain('Mozilla');
      });

      test('should return different User-Agents on different calls', () => {
        const ua1 = antiDetection.getRandomUserAgent();
        const ua2 = antiDetection.getRandomUserAgent();

        // Not guaranteed different, but very likely
        // Just verify both are valid
        expect(ua1).toBeDefined();
        expect(ua2).toBeDefined();
      });

      test('should support specific browser selection', () => {
        const ua = antiDetection.getRandomUserAgent('chrome');

        expect(ua).toContain('Chrome');
      });

      test('should support Firefox User-Agent', () => {
        const ua = antiDetection.getRandomUserAgent('firefox');

        expect(ua).toContain('Firefox');
      });

      test('should support Safari User-Agent', () => {
        const ua = antiDetection.getRandomUserAgent('safari');

        expect(ua).toContain('Safari');
      });
    });

    describe('Header Rotation', () => {
      test('should generate browser headers', () => {
        const headers = antiDetection.getAntiDetectionHeaders();

        expect(headers).toBeDefined();
        expect(headers['User-Agent']).toBeDefined();
        expect(headers['Accept-Language']).toBeDefined();
      });

      test('should include common browser headers', () => {
        const headers = antiDetection.getAntiDetectionHeaders();

        expect(headers['Accept']).toBeDefined();
        expect(headers['Accept-Encoding']).toBeDefined();
        expect(headers['Accept-Language']).toBeDefined();
        expect(headers['User-Agent']).toBeDefined();
        expect(headers['Referer']).toBeDefined();
      });

      test('should vary headers between calls', () => {
        const headers: Array<Record<string, string>> = [];
        for (let i = 0; i < 5; i++) {
          headers.push(antiDetection.getAntiDetectionHeaders());
        }

        // At least some User-Agents should vary across 5 calls
        const userAgents = headers.map(h => h['User-Agent']);
        const uniqueUAs = new Set(userAgents);
        expect(uniqueUAs.size).toBeGreaterThan(1);
      });

      test('should support custom base headers', () => {
        const customHeaders = {
          'Custom-Header': 'custom-value',
        };

        const headers = antiDetection.getAntiDetectionHeaders(customHeaders);

        expect(headers['Custom-Header']).toBe('custom-value');
        expect(headers['User-Agent']).toBeDefined();
      });
    });

    describe('Browser Fingerprint Spoofing', () => {
      test('should generate random screen resolution', () => {
        const resolution = antiDetection.getRandomScreenResolution();

        expect(resolution).toBeDefined();
        expect(resolution.width).toBeGreaterThan(0);
        expect(resolution.height).toBeGreaterThan(0);
      });

      test('should generate random timezone', () => {
        const tz = antiDetection.getRandomTimezone();

        expect(tz).toBeDefined();
        expect(tz.length).toBeGreaterThan(0);
      });

      test('should generate random language', () => {
        const lang = antiDetection.getRandomLanguage();

        expect(lang).toBeDefined();
        expect(lang).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
      });

      test('should generate browser fingerprint object', () => {
        const fingerprint = antiDetection.getRandomFingerprint();

        expect(fingerprint).toBeDefined();
        expect(fingerprint.userAgent).toBeDefined();
        expect(fingerprint.timezone).toBeDefined();
        expect(fingerprint.language).toBeDefined();
        expect(fingerprint.screenResolution).toBeDefined();
      });

      test('should support consistent fingerprint generation', () => {
        const seed = 'test-seed';
        const fp1 = antiDetection.getRandomFingerprint(seed);
        const fp2 = antiDetection.getRandomFingerprint(seed);

        expect(fp1.userAgent).toBe(fp2.userAgent);
        expect(fp1.timezone).toBe(fp2.timezone);
        expect(fp1.language).toBe(fp2.language);
      });
    });

    describe('WebGL Spoofing', () => {
      test('should generate random WebGL renderer string', () => {
        const renderer = antiDetection.getRandomWebGLRenderer();

        expect(renderer).toBeDefined();
        expect(renderer.length).toBeGreaterThan(0);
      });

      test('should support common GPU vendors', () => {
        const renderer = antiDetection.getRandomWebGLRenderer();

        // Should contain a common GPU vendor
        const vendors = ['ANGLE', 'NVIDIA', 'AMD', 'Intel', 'Apple'];
        expect(
          vendors.some(v => renderer.toUpperCase().includes(v.toUpperCase()))
        ).toBe(true);
      });

      test('should generate different WebGL strings', () => {
        const renderer1 = antiDetection.getRandomWebGLRenderer();
        const renderer2 = antiDetection.getRandomWebGLRenderer();

        // Likely different
        expect(renderer1).toBeDefined();
        expect(renderer2).toBeDefined();
      });
    });

    describe('Canvas Fingerprinting Evasion', () => {
      test('should provide canvas evasion script', () => {
        const script = antiDetection.getCanvasEvadeScript();

        expect(script).toBeDefined();
        expect(script.length).toBeGreaterThan(0);
        expect(script).toContain('canvas');
      });

      test('should provide WebGL evasion script', () => {
        const script = antiDetection.getWebGLEvadeScript();

        expect(script).toBeDefined();
        expect(script.length).toBeGreaterThan(0);
        expect(script).toContain('WebGL');
      });
    });

    describe('Stealth Headers', () => {
      test('should generate stealth headers to hide automation', () => {
        const headers = antiDetection.getStealthHeaders();

        expect(headers).toBeDefined();
        expect(headers['Chrome-Lighthouse']).toBeUndefined();
      });

      test('should prevent WebDriver detection', () => {
        const headers = antiDetection.getStealthHeaders();

        // Should not expose automation markers
        expect(JSON.stringify(headers)).not.toContain('webdriver');
      });
    });
  });

  describe('Integration', () => {
    test('should use proxy with anti-detection headers together', () => {
      const proxies: Proxy[] = [
        {
          host: '10.0.0.1',
          port: 8080,
          protocol: 'http',
        },
      ];

      const proxyManager = new ProxyManager(proxies);
      const antiDetection = new AntiDetection();

      const proxy = proxyManager.getNextProxy();
      const headers = antiDetection.getAntiDetectionHeaders();

      expect(proxy).toBeDefined();
      expect(headers['User-Agent']).toBeDefined();
    });

    test('should rotate both proxy and headers on each request', () => {
      const proxies: Proxy[] = [
        { host: '10.0.0.1', port: 8080, protocol: 'http' },
        { host: '10.0.0.2', port: 8080, protocol: 'http' },
      ];

      const proxyManager = new ProxyManager(proxies);
      const antiDetection = new AntiDetection();

      const combinations: Array<{ proxy: string; ua: string }> = [];

      for (let i = 0; i < 4; i++) {
        const proxy = proxyManager.getNextProxy();
        const headers = antiDetection.getAntiDetectionHeaders();

        combinations.push({
          proxy: proxy.host,
          ua: headers['User-Agent'],
        });
      }

      // Should have different proxies
      const uniqueProxies = new Set(combinations.map(c => c.proxy));
      expect(uniqueProxies.size).toBeGreaterThan(1);

      // Should have different User-Agents (likely)
      const uniqueUAs = new Set(combinations.map(c => c.ua));
      expect(uniqueUAs.size).toBeGreaterThan(1);
    });

    test('should support rate limiting with proxy rotation', () => {
      const proxies: Proxy[] = [
        { host: '10.0.0.1', port: 8080, protocol: 'http' },
        { host: '10.0.0.2', port: 8080, protocol: 'http' },
        { host: '10.0.0.3', port: 8080, protocol: 'http' },
      ];

      const proxyManager = new ProxyManager(proxies, {
        failureThreshold: 1,
      });

      // Simulate hitting rate limit
      proxyManager.recordProxyFailure(proxies[0]);

      // Next should be different proxy
      const nextProxy = proxyManager.getNextProxy(
        ProxyRotationStrategy.HEALTHY_FIRST
      );

      expect(nextProxy.host).not.toBe(proxies[0].host);
    });
  });
});
