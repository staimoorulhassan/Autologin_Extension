/**
 * Task 8: Proxy Manager
 * Handles proxy rotation, health checking, and statistics tracking
 */

import type { Proxy } from '../types';

export enum ProxyRotationStrategy {
  ROUND_ROBIN = 'round-robin',
  RANDOM = 'random',
  HEALTHY_FIRST = 'healthy-first',
  LEAST_USED = 'least-used',
}

export interface ProxyHealth {
  host: string;
  port: number;
  protocol: string;
  healthy: boolean;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageResponseTime_ms: number;
  lastUsed?: Date;
  usageCount: number;
}

export interface ProxyManagerOptions {
  failureThreshold?: number;
  maxRetries?: number;
  responseTimeLimit_ms?: number;
}

export interface ProxyStatistics {
  totalRotations: number;
  averageResponseTime_ms: number;
  slowestProxy?: ProxyHealth;
  mostReliableProxy?: ProxyHealth;
}

export class ProxyManager {
  private proxies: Proxy[];
  private health: Map<string, ProxyHealth>;
  private currentIndex: number = 0;
  private healthyIndex: number = 0;
  private rotationCount: number = 0;
  private failureThreshold: number;

  constructor(proxies: Proxy[], options?: ProxyManagerOptions) {
    if (!proxies || proxies.length === 0) {
      throw new Error('At least one proxy must be provided');
    }

    this.proxies = proxies;
    this.failureThreshold = options?.failureThreshold || 5;
    this.health = new Map();

    // Initialize health tracking for all proxies
    proxies.forEach(proxy => {
      const key = `${proxy.host}:${proxy.port}`;
      this.health.set(key, {
        host: proxy.host,
        port: proxy.port,
        protocol: proxy.protocol,
        healthy: true,
        successCount: 0,
        failureCount: 0,
        successRate: 1,
        averageResponseTime_ms: 0,
        usageCount: 0,
      });
    });
  }

  getNextProxy(
    strategy: ProxyRotationStrategy | ((proxies: Proxy[]) => Proxy) = ProxyRotationStrategy.ROUND_ROBIN
  ): Proxy {
    this.rotationCount++;

    if (typeof strategy === 'function') {
      return strategy(this.proxies);
    }

    switch (strategy) {
      case ProxyRotationStrategy.ROUND_ROBIN:
        return this.roundRobinRotation();

      case ProxyRotationStrategy.RANDOM:
        return this.randomRotation();

      case ProxyRotationStrategy.HEALTHY_FIRST:
        return this.healthyFirstRotation();

      case ProxyRotationStrategy.LEAST_USED:
        return this.leastUsedRotation();

      default:
        return this.roundRobinRotation();
    }
  }

  private roundRobinRotation(): Proxy {
    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxy;
  }

  private randomRotation(): Proxy {
    const index = Math.floor(Math.random() * this.proxies.length);
    return this.proxies[index];
  }

  private healthyFirstRotation(): Proxy {
    const healthyProxies = this.proxies.filter(p => {
      const key = `${p.host}:${p.port}`;
      const h = this.health.get(key);
      return h?.healthy;
    });

    if (healthyProxies.length === 0) {
      return this.proxies[this.currentIndex % this.proxies.length];
    }

    const proxy = healthyProxies[this.healthyIndex % healthyProxies.length];
    this.healthyIndex++;
    return proxy;
  }

  private leastUsedRotation(): Proxy {
    let leastUsed = this.proxies[0];
    let minUsage = this.getProxyHealthKey(leastUsed)?.usageCount ?? 0;

    for (const proxy of this.proxies) {
      const h = this.getProxyHealthKey(proxy);
      if (h && h.usageCount < minUsage) {
        leastUsed = proxy;
        minUsage = h.usageCount;
      }
    }

    const key = `${leastUsed.host}:${leastUsed.port}`;
    const h = this.health.get(key);
    if (h) {
      h.usageCount++;
    }

    return leastUsed;
  }

  markProxyHealthy(proxy: Proxy): void {
    const key = `${proxy.host}:${proxy.port}`;
    const h = this.health.get(key);
    if (h) {
      h.healthy = true;
    }
  }

  markProxyUnhealthy(proxy: Proxy): void {
    const key = `${proxy.host}:${proxy.port}`;
    const h = this.health.get(key);
    if (h) {
      h.healthy = false;
    }
  }

  recordProxySuccess(proxy: Proxy, responseTime_ms?: number): void {
    const key = `${proxy.host}:${proxy.port}`;
    const h = this.health.get(key);

    if (!h) return;

    h.successCount++;
    h.failureCount = 0; // Reset failure count on success
    h.lastUsed = new Date();

    if (responseTime_ms !== undefined) {
      // Calculate running average
      const totalTime =
        h.averageResponseTime_ms * (h.successCount - 1) + responseTime_ms;
      h.averageResponseTime_ms = totalTime / h.successCount;
    }

    this.updateSuccessRate(h);
  }

  recordProxyFailure(proxy: Proxy, _responseTime_ms?: number): void {
    const key = `${proxy.host}:${proxy.port}`;
    const h = this.health.get(key);

    if (!h) return;

    h.failureCount++;
    h.lastUsed = new Date();

    // Mark unhealthy if failure threshold exceeded
    if (h.failureCount >= this.failureThreshold) {
      h.healthy = false;
    }

    this.updateSuccessRate(h);
  }

  private updateSuccessRate(health: ProxyHealth): void {
    const total = health.successCount + health.failureCount;
    if (total === 0) {
      health.successRate = 1;
    } else {
      health.successRate = health.successCount / total;
    }
  }

  getProxyUrl(proxy: Proxy): string {
    const { protocol, host, port, username, password } = proxy;

    if (username && password) {
      return `${protocol}://${username}:${password}@${host}:${port}`;
    }

    return `${protocol}://${host}:${port}`;
  }

  getProxyHealth(): ProxyHealth[] {
    return Array.from(this.health.values());
  }

  getStatistics(): ProxyStatistics {
    const healthList = this.getProxyHealth();

    let averageResponseTime = 0;
    let totalResponseTime = 0;
    let countWithTime = 0;

    for (const h of healthList) {
      if (h.averageResponseTime_ms > 0) {
        totalResponseTime += h.averageResponseTime_ms;
        countWithTime++;
      }
    }

    if (countWithTime > 0) {
      averageResponseTime = totalResponseTime / countWithTime;
    }

    const slowestProxy = healthList.reduce((slowest, current) =>
      current.averageResponseTime_ms > (slowest?.averageResponseTime_ms ?? 0)
        ? current
        : slowest
    );

    const mostReliableProxy = healthList.reduce((most, current) =>
      current.successRate > (most?.successRate ?? 0) ? current : most
    );

    return {
      totalRotations: this.rotationCount,
      averageResponseTime_ms: Math.round(averageResponseTime),
      slowestProxy: slowestProxy.averageResponseTime_ms > 0 ? slowestProxy : undefined,
      mostReliableProxy: mostReliableProxy.successCount > 0 ? mostReliableProxy : undefined,
    };
  }

  private getProxyHealthKey(proxy: Proxy): ProxyHealth | undefined {
    const key = `${proxy.host}:${proxy.port}`;
    return this.health.get(key);
  }
}
