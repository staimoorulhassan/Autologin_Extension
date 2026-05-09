/**
 * Task 10: Logger
 * Structured logging with level filtering and formatting
 */

import type { LogEntry } from '../types';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export class Logger {
  private name: string;
  private logLevel: LogLevel;
  private logs: LogEntry[] = [];

  constructor(name: string, logLevel: LogLevel = LogLevel.INFO) {
    this.name = name;
    this.logLevel = logLevel;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentIndex = levels.indexOf(this.logLevel);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  debug(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.log(LogLevel.DEBUG, message, metadata);
    }
  }

  info(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.log(LogLevel.INFO, message, metadata);
    }
  }

  warn(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.log(LogLevel.WARN, message, metadata);
    }
  }

  error(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.log(LogLevel.ERROR, message, metadata);
    }
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      logger: this.name,
      level,
      message,
      metadata,
    };
    this.logs.push(entry);
  }

  getLogs(
    level?: LogLevel,
    startTime?: Date,
    endTime?: Date,
    limit?: number
  ): LogEntry[] {
    let filtered = this.logs;

    if (level) {
      filtered = filtered.filter(log => log.level === level);
    }

    if (startTime) {
      filtered = filtered.filter(log => log.timestamp >= startTime);
    }

    if (endTime) {
      filtered = filtered.filter(log => log.timestamp <= endTime);
    }

    if (limit) {
      filtered = filtered.slice(-limit);
    }

    return filtered;
  }

  clearLogs(): void {
    this.logs = [];
  }

  formatAsJSON(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  formatAsCSV(): string {
    if (this.logs.length === 0) {
      return '';
    }

    const header = 'Timestamp,Logger,Level,Message\n';
    const rows = this.logs
      .map(
        log =>
          `"${log.timestamp.toISOString()}","${log.logger}","${log.level}","${log.message}"`
      )
      .join('\n');

    return header + rows;
  }

  formatCustom(formatter: (log: LogEntry) => string): string {
    return this.logs.map(formatter).join('\n');
  }
}
