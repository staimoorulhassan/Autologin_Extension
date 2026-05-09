/**
 * Task 10: Alert System
 * Alert rules, triggering, and management
 */

import type { Alert } from '../types';

export interface AlertRule {
  name: string;
  condition: string;
  severity: 'info' | 'warning' | 'error';
  message?: string;
}

export interface AlertStats {
  totalAlerts: number;
  byRule: Record<string, number>;
  bySeverity: Record<string, number>;
}

export class AlertSystem {
  private rules: Map<string, AlertRule> = new Map();
  private alerts: Alert[] = [];
  private ruleAlerts: Map<string, string[]> = new Map();

  addRule(rule: AlertRule): void {
    this.rules.set(rule.name, rule);
    this.ruleAlerts.set(rule.name, []);
  }

  removeRule(name: string): void {
    this.rules.delete(name);
    this.ruleAlerts.delete(name);
  }

  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  evaluateCondition(ruleName: string, value: any): void {
    const rule = this.rules.get(ruleName);
    if (!rule) {
      return;
    }

    const id = `${ruleName}_${Date.now()}_${Math.random()}`;
    const alert: Alert = {
      id,
      ruleName,
      severity: rule.severity,
      timestamp: new Date(),
      acknowledged: false,
      value,
      message: rule.message?.replace('{value}', value),
    };

    this.alerts.push(alert);
    const ruleAlerts = this.ruleAlerts.get(ruleName) || [];
    ruleAlerts.push(id);
    this.ruleAlerts.set(ruleName, ruleAlerts);
  }

  getAlerts(limit?: number): Alert[] {
    if (limit) {
      return this.alerts.slice(-limit);
    }
    return this.alerts;
  }

  getAlert(id: string): Alert | undefined {
    return this.alerts.find(a => a.id === id);
  }

  clearAlerts(): void {
    this.alerts = [];
    this.ruleAlerts.forEach(ids => ids.length = 0);
  }

  acknowledgeAlert(id: string): void {
    const alert = this.alerts.find(a => a.id === id);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  getAlertsBySeverity(severity: string): Alert[] {
    return this.alerts.filter(a => a.severity === severity);
  }

  getUnacknowledgedAlerts(): Alert[] {
    return this.alerts.filter(a => !a.acknowledged);
  }

  getAlertsByRule(ruleName: string): Alert[] {
    return this.alerts.filter(a => a.ruleName === ruleName);
  }

  getAlertStats(): AlertStats {
    const stats: AlertStats = {
      totalAlerts: this.alerts.length,
      byRule: {},
      bySeverity: {},
    };

    this.alerts.forEach(alert => {
      stats.byRule[alert.ruleName] = (stats.byRule[alert.ruleName] || 0) + 1;
      stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
    });

    return stats;
  }
}
