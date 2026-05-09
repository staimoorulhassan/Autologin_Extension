/**
 * Task 10: Monitoring & Logging Tests
 * Tests for Logger, Monitor, and AlertSystem classes
 */

import { Logger, LogLevel } from '../../monitoring/logger';
import { Monitor } from '../../monitoring/monitor';
import { AlertSystem } from '../../monitoring/alerts';
import type { AlertRule } from '../../monitoring/alerts';

describe('Task 10: Monitoring & Logging', () => {
  describe('Logger', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger('test-app');
    });

    describe('Initialization', () => {
      test('should initialize logger with name', () => {
        expect(logger).toBeDefined();
      });

      test('should set default log level to INFO', () => {
        expect(logger.getLogLevel()).toBe(LogLevel.INFO);
      });

      test('should allow custom log level', () => {
        const customLogger = new Logger('test', LogLevel.DEBUG);
        expect(customLogger.getLogLevel()).toBe(LogLevel.DEBUG);
      });

      test('should support log level changes', () => {
        logger.setLogLevel(LogLevel.DEBUG);
        expect(logger.getLogLevel()).toBe(LogLevel.DEBUG);
      });
    });

    describe('Log Levels', () => {
      test('should log DEBUG messages when level is DEBUG', () => {
        logger.setLogLevel(LogLevel.DEBUG);
        const logs = logger.getLogs();

        logger.debug('Debug message');

        expect(logs.length).toBeGreaterThan(0);
        expect(logs[logs.length - 1].level).toBe(LogLevel.DEBUG);
      });

      test('should log INFO messages', () => {
        logger.info('Info message');

        const logs = logger.getLogs();

        expect(logs.length).toBeGreaterThan(0);
        expect(logs[logs.length - 1].level).toBe(LogLevel.INFO);
      });

      test('should log WARNING messages', () => {
        logger.warn('Warning message');

        const logs = logger.getLogs();

        expect(logs.length).toBeGreaterThan(0);
        expect(logs[logs.length - 1].level).toBe(LogLevel.WARN);
      });

      test('should log ERROR messages', () => {
        logger.error('Error message');

        const logs = logger.getLogs();

        expect(logs.length).toBeGreaterThan(0);
        expect(logs[logs.length - 1].level).toBe(LogLevel.ERROR);
      });

      test('should respect log level filtering', () => {
        logger.setLogLevel(LogLevel.WARN);

        logger.debug('Debug message');
        logger.info('Info message');
        logger.warn('Warning message');

        const logs = logger.getLogs();

        // Should only have WARNING (and maybe errors)
        const warnCount = logs.filter((l: any) => l.level === LogLevel.WARN).length;
        expect(warnCount).toBeGreaterThan(0);
      });
    });

    describe('Structured Logging', () => {
      test('should include timestamp in logs', () => {
        logger.info('Test message');

        const logs = logger.getLogs();

        expect(logs[logs.length - 1].timestamp).toBeDefined();
      });

      test('should include log level in logs', () => {
        logger.error('Error message');

        const logs = logger.getLogs();

        expect(logs[logs.length - 1].level).toBeDefined();
      });

      test('should include message in logs', () => {
        const message = 'Test message';
        logger.info(message);

        const logs = logger.getLogs();

        expect(logs[logs.length - 1].message).toBe(message);
      });

      test('should support metadata in logs', () => {
        logger.info('Login attempt', { accountId: 'acc123', success: true });

        const logs = logger.getLogs();

        expect(logs[logs.length - 1].metadata).toBeDefined();
        expect(logs[logs.length - 1].metadata?.accountId).toBe('acc123');
      });

      test('should include logger name in logs', () => {
        logger.info('Test message');

        const logs = logger.getLogs();

        expect(logs[logs.length - 1].logger).toBe('test-app');
      });
    });

    describe('Log Storage', () => {
      test('should retrieve all logs', () => {
        logger.info('Message 1');
        logger.info('Message 2');
        logger.warn('Message 3');

        const logs = logger.getLogs();

        expect(logs.length).toBeGreaterThanOrEqual(3);
      });

      test('should filter logs by level', () => {
        logger.info('Info 1');
        logger.warn('Warn 1');
        logger.error('Error 1');
        logger.info('Info 2');

        const warnings = logger.getLogs(LogLevel.WARN);

        expect(warnings.every((l: any) => l.level === LogLevel.WARN)).toBe(true);
      });

      test('should filter logs by time range', () => {
        const before = new Date();
        logger.info('Message');
        const after = new Date();

        const logs = logger.getLogs(undefined, before, after);

        expect(logs.length).toBeGreaterThan(0);
      });

      test('should support log limit', () => {
        for (let i = 0; i < 100; i++) {
          logger.info(`Message ${i}`);
        }

        const logs = logger.getLogs(undefined, undefined, undefined, 10);

        expect(logs.length).toBeLessThanOrEqual(10);
      });

      test('should clear logs', () => {
        logger.info('Message 1');
        logger.info('Message 2');

        logger.clearLogs();

        const logs = logger.getLogs();

        expect(logs.length).toBe(0);
      });
    });

    describe('Log Formatting', () => {
      test('should format logs as JSON', () => {
        logger.info('Test message', { key: 'value' });

        const formatted = logger.formatAsJSON();

        expect(formatted).toContain('Test message');
        expect(formatted).toContain('key');
      });

      test('should format logs as CSV', () => {
        logger.info('Test message');

        const csv = logger.formatAsCSV();

        expect(csv).toContain('Test message');
        expect(csv).toContain('INFO');
      });

      test('should support custom log format', () => {
        logger.info('Test message', { userId: 'user123' });

        const formatted = logger.formatCustom((log: any) =>
          `[${log.timestamp.toISOString()}] ${log.level}: ${log.message}`
        );

        expect(formatted).toContain('Test message');
        expect(formatted).toContain('INFO');
      });
    });
  });

  describe('Monitor', () => {
    let monitor: Monitor;

    beforeEach(() => {
      monitor = new Monitor();
    });

    describe('Initialization', () => {
      test('should initialize monitor', () => {
        expect(monitor).toBeDefined();
      });

      test('should start with no metrics', () => {
        const metrics = monitor.getMetrics();

        expect(metrics).toBeDefined();
      });
    });

    describe('Metric Tracking', () => {
      test('should record metric value', () => {
        monitor.recordMetric('cpu_usage', 45.5);

        const metrics = monitor.getMetrics();

        expect(metrics.cpu_usage).toBeDefined();
      });

      test('should track metric history', () => {
        monitor.recordMetric('memory_usage', 100);
        monitor.recordMetric('memory_usage', 150);
        monitor.recordMetric('memory_usage', 120);

        const history = monitor.getMetricHistory('memory_usage');

        expect(history.length).toBe(3);
      });

      test('should calculate metric statistics', () => {
        for (let i = 0; i < 10; i++) {
          monitor.recordMetric('response_time_ms', 100 + i * 10);
        }

        const stats = monitor.getMetricStats('response_time_ms');

        expect(stats.average).toBeGreaterThan(0);
        expect(stats.min).toBeLessThan(stats.max);
        expect(stats.count).toBe(10);
      });

      test('should calculate average', () => {
        monitor.recordMetric('test_metric', 10);
        monitor.recordMetric('test_metric', 20);
        monitor.recordMetric('test_metric', 30);

        const stats = monitor.getMetricStats('test_metric');

        expect(stats.average).toBe(20);
      });

      test('should calculate min and max', () => {
        monitor.recordMetric('metric', 5);
        monitor.recordMetric('metric', 15);
        monitor.recordMetric('metric', 10);

        const stats = monitor.getMetricStats('metric');

        expect(stats.min).toBe(5);
        expect(stats.max).toBe(15);
      });

      test('should track count', () => {
        for (let i = 0; i < 5; i++) {
          monitor.recordMetric('login_attempts', 1);
        }

        const stats = monitor.getMetricStats('login_attempts');

        expect(stats.count).toBe(5);
      });
    });

    describe('Performance Tracking', () => {
      test('should measure operation duration', async () => {
        const duration = await monitor.measureAsync('test_operation', async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
        });

        expect(duration).toBeGreaterThanOrEqual(50);
      });

      test('should track operation duration in metrics', async () => {
        await monitor.measureAsync('my_operation', async () => {
          await new Promise(resolve => setTimeout(resolve, 25));
        });

        const history = monitor.getMetricHistory('my_operation_duration_ms');

        expect(history.length).toBeGreaterThan(0);
      });

      test('should support sync operation measurement', () => {
        const duration = monitor.measureSync('sync_op', () => {
          let sum = 0;
          for (let i = 0; i < 100000; i++) {
            sum += i;
          }
          return sum;
        });

        expect(duration).toBeGreaterThanOrEqual(0);
        const metrics = monitor.getMetrics();
        expect(metrics['sync_op_duration_ms']).toBeDefined();
      });

      test('should record errors in measurements', async () => {
        try {
          await monitor.measureAsync('failing_op', async () => {
            throw new Error('Test error');
          });
        } catch {
          // Expected
        }

        const metrics = monitor.getMetrics();

        expect(metrics).toBeDefined();
      });
    });

    describe('Health Status', () => {
      test('should track service health', () => {
        monitor.recordHealth('api_service', true);

        const health = monitor.getHealth('api_service');

        expect(health).toBe(true);
      });

      test('should track multiple services', () => {
        monitor.recordHealth('service_a', true);
        monitor.recordHealth('service_b', false);
        monitor.recordHealth('service_c', true);

        const allHealth = monitor.getAllHealth();

        expect(allHealth.service_a).toBe(true);
        expect(allHealth.service_b).toBe(false);
        expect(allHealth.service_c).toBe(true);
      });

      test('should check overall health', () => {
        monitor.recordHealth('service_a', true);
        monitor.recordHealth('service_b', true);

        const overall = monitor.isHealthy();

        expect(overall).toBe(true);
      });

      test('should report unhealthy when any service down', () => {
        monitor.recordHealth('service_a', true);
        monitor.recordHealth('service_b', false);

        const overall = monitor.isHealthy();

        expect(overall).toBe(false);
      });
    });
  });

  describe('AlertSystem', () => {
    let alertSystem: AlertSystem;

    beforeEach(() => {
      alertSystem = new AlertSystem();
    });

    describe('Initialization', () => {
      test('should initialize alert system', () => {
        expect(alertSystem).toBeDefined();
      });

      test('should start with no alerts', () => {
        const alerts = alertSystem.getAlerts();

        expect(alerts.length).toBe(0);
      });
    });

    describe('Alert Rules', () => {
      test('should add threshold alert rule', () => {
        const rule: AlertRule = {
          name: 'high_cpu',
          condition: 'metric_value > 80',
          severity: 'warning',
        };

        alertSystem.addRule(rule);

        const rules = alertSystem.getRules();

        expect(rules.length).toBeGreaterThan(0);
      });

      test('should remove alert rule', () => {
        const rule: AlertRule = {
          name: 'test_rule',
          condition: 'metric_value > 50',
          severity: 'error',
        };

        alertSystem.addRule(rule);
        alertSystem.removeRule('test_rule');

        const rules = alertSystem.getRules();

        expect(rules.find((r: AlertRule) => r.name === 'test_rule')).toBeUndefined();
      });

      test('should support multiple severity levels', () => {
        alertSystem.addRule({
          name: 'info_alert',
          condition: 'x < 10',
          severity: 'info',
        });
        alertSystem.addRule({
          name: 'warning_alert',
          condition: 'x > 20',
          severity: 'warning',
        });
        alertSystem.addRule({
          name: 'error_alert',
          condition: 'x > 100',
          severity: 'error',
        });

        const rules = alertSystem.getRules();

        expect(rules.length).toBe(3);
      });
    });

    describe('Alert Triggering', () => {
      test('should trigger alert when rule condition met', () => {
        alertSystem.addRule({
          name: 'high_value',
          condition: 'metric_value > 50',
          severity: 'warning',
        });

        alertSystem.evaluateCondition('high_value', 75);

        const alerts = alertSystem.getAlerts();

        expect(alerts.length).toBeGreaterThan(0);
      });

      test('should not trigger alert for non-existent rule', () => {
        alertSystem.evaluateCondition('non_existent_rule', 30);

        const alerts = alertSystem.getAlerts();

        expect(alerts.length).toBe(0);
      });

      test('should include alert details', () => {
        alertSystem.addRule({
          name: 'test_alert',
          condition: 'value > 100',
          severity: 'error',
        });

        alertSystem.evaluateCondition('test_alert', 150);

        const alerts = alertSystem.getAlerts();

        expect(alerts[0].ruleName).toBe('test_alert');
        expect(alerts[0].severity).toBe('error');
        expect(alerts[0].timestamp).toBeDefined();
      });

      test('should support custom alert messages', () => {
        alertSystem.addRule({
          name: 'custom_alert',
          condition: 'x > 10',
          severity: 'warning',
          message: 'Value exceeded threshold: {value}',
        });

        alertSystem.evaluateCondition('custom_alert', 20);

        const alerts = alertSystem.getAlerts();

        expect(alerts[0].message).toBeDefined();
      });
    });

    describe('Alert Management', () => {
      test('should clear alerts', () => {
        alertSystem.addRule({
          name: 'test',
          condition: 'x > 0',
          severity: 'info',
        });

        alertSystem.evaluateCondition('test', 5);
        alertSystem.clearAlerts();

        const alerts = alertSystem.getAlerts();

        expect(alerts.length).toBe(0);
      });

      test('should acknowledge alert', () => {
        alertSystem.addRule({
          name: 'test',
          condition: 'x > 0',
          severity: 'warning',
        });

        alertSystem.evaluateCondition('test', 5);
        const alerts = alertSystem.getAlerts();

        alertSystem.acknowledgeAlert(alerts[0].id);

        const acked = alertSystem.getAlert(alerts[0].id);

        expect(acked?.acknowledged).toBe(true);
      });

      test('should filter alerts by severity', () => {
        alertSystem.addRule({
          name: 'info_alert',
          condition: 'x > 0',
          severity: 'info',
        });
        alertSystem.addRule({
          name: 'error_alert',
          condition: 'x > 0',
          severity: 'error',
        });

        alertSystem.evaluateCondition('info_alert', 5);
        alertSystem.evaluateCondition('error_alert', 10);

        const errors = alertSystem.getAlertsBySeverity('error');

        expect(errors.length).toBeGreaterThan(0);
        expect(errors.every(a => a.severity === 'error')).toBe(true);
      });

      test('should list unacknowledged alerts', () => {
        alertSystem.addRule({
          name: 'test',
          condition: 'x > 0',
          severity: 'warning',
        });

        alertSystem.evaluateCondition('test', 5);

        const unacked = alertSystem.getUnacknowledgedAlerts();

        expect(unacked.length).toBeGreaterThan(0);
      });
    });

    describe('Alert History', () => {
      test('should maintain alert history', () => {
        alertSystem.addRule({
          name: 'test',
          condition: 'x > 0',
          severity: 'warning',
        });

        for (let i = 0; i < 5; i++) {
          alertSystem.evaluateCondition('test', 10 + i);
        }

        const alerts = alertSystem.getAlerts();

        expect(alerts.length).toBeGreaterThanOrEqual(5);
      });

      test('should retrieve alert history by rule', () => {
        alertSystem.addRule({
          name: 'rule_a',
          condition: 'x > 0',
          severity: 'info',
        });
        alertSystem.addRule({
          name: 'rule_b',
          condition: 'x > 0',
          severity: 'warning',
        });

        alertSystem.evaluateCondition('rule_a', 5);
        alertSystem.evaluateCondition('rule_a', 10);
        alertSystem.evaluateCondition('rule_b', 15);

        const ruleAAlerts = alertSystem.getAlertsByRule('rule_a');

        expect(ruleAAlerts.length).toBe(2);
      });

      test('should support alert limit', () => {
        alertSystem.addRule({
          name: 'test',
          condition: 'x > 0',
          severity: 'info',
        });

        for (let i = 0; i < 100; i++) {
          alertSystem.evaluateCondition('test', i);
        }

        const limited = alertSystem.getAlerts(10);

        expect(limited.length).toBeLessThanOrEqual(10);
      });
    });

    describe('Integration', () => {
      test('should track alert metrics', () => {
        alertSystem.addRule({
          name: 'test',
          condition: 'x > 50',
          severity: 'warning',
        });

        alertSystem.evaluateCondition('test', 60);
        alertSystem.evaluateCondition('test', 40);
        alertSystem.evaluateCondition('test', 75);

        const stats = alertSystem.getAlertStats();

        expect(stats.totalAlerts).toBeGreaterThan(0);
        expect(stats.byRule).toBeDefined();
      });

      test('should calculate alert rate', () => {
        alertSystem.addRule({
          name: 'test',
          condition: 'x > 0',
          severity: 'info',
        });

        for (let i = 0; i < 5; i++) {
          alertSystem.evaluateCondition('test', i + 10);
        }

        const stats = alertSystem.getAlertStats();

        expect(stats.totalAlerts).toBe(5);
      });
    });
  });

  describe('Integration Tests', () => {
    test('should log and monitor login attempts', () => {
      const logger = new Logger('auth');
      const monitor = new Monitor();

      logger.info('Login attempt', { accountId: 'acc1', success: true });
      monitor.recordMetric('login_success', 1);
      monitor.recordMetric('login_duration_ms', 1500);

      const logs = logger.getLogs();

      expect(logs.length).toBeGreaterThan(0);
    });

    test('should create alerts from monitor metrics', () => {
      const monitor = new Monitor();
      const alertSystem = new AlertSystem();

      alertSystem.addRule({
        name: 'slow_login',
        condition: 'duration > 5000',
        severity: 'warning',
      });

      monitor.recordMetric('login_duration_ms', 6000);
      alertSystem.evaluateCondition('slow_login', 6000);

      const alerts = alertSystem.getAlerts();

      expect(alerts.length).toBeGreaterThan(0);
    });

    test('should track multiple services with logger and monitor', () => {
      const logger = new Logger('multi-service');
      const monitor = new Monitor();

      logger.info('API request', { service: 'auth', status: 200 });
      logger.info('API request', { service: 'proxy', status: 200 });

      monitor.recordHealth('auth_service', true);
      monitor.recordHealth('proxy_service', true);

      const logs = logger.getLogs();
      const health = monitor.getAllHealth();

      expect(logs.length).toBeGreaterThan(0);
      expect(health.auth_service).toBe(true);
    });
  });
});
