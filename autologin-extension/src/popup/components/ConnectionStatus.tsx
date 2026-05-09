/**
 * Task 4: ConnectionStatus Component
 * Displays background worker connection status
 */

// No React import needed for functional component

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface ConnectionStatusProps {
  status: ConnectionStatus;
  message?: string;
  onRetry?: () => void | Promise<void>;
}

/**
 * Component that displays connection status indicator
 */
export function ConnectionStatus({ status, message, onRetry }: ConnectionStatusProps) {
  const getStatusColor = (): string => {
    switch (status) {
      case 'connected':
        return 'green';
      case 'disconnected':
        return 'red';
      case 'connecting':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  const getStatusText = (): string => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Disconnected';
      case 'connecting':
        return 'Connecting...';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="connection-status">
      <div className="status-indicator" role="status">
        <div
          className={`status-dot status-${status}`}
          style={{
            backgroundColor: getStatusColor(),
          }}
        />
        <span className="status-text">{getStatusText()}</span>
      </div>

      {message && <div className="status-message">{message}</div>}

      {status === 'disconnected' && onRetry && (
        <button onClick={onRetry} className="retry-button">
          Retry Connection
        </button>
      )}
    </div>
  );
}
