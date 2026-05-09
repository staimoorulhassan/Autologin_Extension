/**
 * Task 4: LoginHistory Component
 * Displays login attempt history for an account
 */

import { useMemo } from 'react';
import type { LoginLog } from '../../types';

interface LoginHistoryProps {
  accountId: string;
  logs: LoginLog[];
}

/**
 * Formats timestamp to readable format
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Component that displays account login history
 */
export function LoginHistory({ accountId, logs }: LoginHistoryProps) {
  // Sort logs by timestamp, most recent first
  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => b.timestamp - a.timestamp);
  }, [logs]);

  if (sortedLogs.length === 0) {
    return (
      <div className="login-history-empty">
        <p>No login history available</p>
      </div>
    );
  }

  return (
    <div className="login-history">
      <h3>Login History for {accountId}</h3>
      <ul className="history-items">
        {sortedLogs.map(log => (
          <li key={log.id} className={`history-item status-${log.status.toLowerCase()}`}>
            <div className="history-header">
              <span className="status-badge">{log.status}</span>
              <span className="timestamp">{formatTimestamp(log.timestamp)}</span>
            </div>
            {log.duration_ms && (
              <div className="history-duration">Duration: {log.duration_ms}ms</div>
            )}
            {log.error_message && (
              <div className="history-error">{log.error_message}</div>
            )}
            {log.captcha_type && (
              <div className="history-captcha">CAPTCHA: {log.captcha_type}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
