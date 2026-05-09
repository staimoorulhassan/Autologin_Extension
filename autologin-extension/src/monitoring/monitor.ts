/**
 * Task 10: Monitor
 * Performance tracking and health monitoring
 */

export interface MetricStats {
  count: number;
  average: number;
  min: number;
  max: number;
  sum: number;
}

export class Monitor {
  private metrics: Map<string, number[]> = new Map();
  private health: Map<string, boolean> = new Map();

  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(value);
  }

  getMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    this.metrics.forEach((values, key) => {
      result[key] = values[values.length - 1];
    });
    return result;
  }

  getMetricHistory(name: string): number[] {
    return this.metrics.get(name) || [];
  }

  getMetricStats(name: string): MetricStats {
    const values = this.metrics.get(name) || [];

    if (values.length === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        sum: 0,
      };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      count: values.length,
      average,
      min,
      max,
      sum,
    };
  }

  async measureAsync<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<number> {
    const start = Date.now();
    try {
      await fn();
      return Date.now() - start;
    } finally {
      const duration = Date.now() - start;
      this.recordMetric(`${name}_duration_ms`, duration);
    }
  }

  measureSync<T>(
    name: string,
    fn: () => T
  ): number {
    const start = Date.now();
    try {
      fn();
      return Date.now() - start;
    } finally {
      const duration = Date.now() - start;
      this.recordMetric(`${name}_duration_ms`, duration);
    }
  }

  recordHealth(serviceName: string, healthy: boolean): void {
    this.health.set(serviceName, healthy);
  }

  getHealth(serviceName: string): boolean {
    return this.health.get(serviceName) ?? false;
  }

  getAllHealth(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    this.health.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  isHealthy(): boolean {
    for (const healthy of this.health.values()) {
      if (!healthy) {
        return false;
      }
    }
    return true;
  }
}
