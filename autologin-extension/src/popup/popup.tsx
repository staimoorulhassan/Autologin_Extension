/**
 * Popup React Component
 * Main UI for account management and login controls
 * Now with Developer tab for batch control
 */

import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { sendToBackground, MESSAGE_TYPES, TimeoutError } from '@messaging/index';
import type { BatchProgress } from '@messaging/types';
import type { Credential, LoginLog } from '../types/index';

type TabType = 'overview' | 'developer';

function App() {
  // Overview state
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialCount, setCredentialCount] = useState<number>(0);
  const [connectionStatus, setConnectionStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [extensionStatus, setExtensionStatus] = useState<'idle' | 'logging_in' | 'error'>('idle');

  // Developer tab state
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [batchStatus, setBatchStatus] = useState<BatchProgress>({
    total: 0,
    completed: 0,
    status: 'idle'
  });
  const [devLogs, setDevLogs] = useState<LoginLog[]>([]);
  const [loginDelay, setLoginDelay] = useState<number>(3);
  const [devMessage, setDevMessage] = useState<string>('');

  /**
   * Load delay from storage on mount
   */
  useEffect(() => {
    chrome.storage.local.get('dev_login_delay_seconds', (result) => {
      const val = result['dev_login_delay_seconds'];
      if (typeof val === 'number') {
        setLoginDelay(val);
      }
    });
  }, []);

  /**
   * Fetch credentials from background worker on mount
   */
  useEffect(() => {
    fetchCredentials();
    fetchStatus();

    // Poll for status updates every 2 seconds
    const statusInterval = setInterval(fetchStatus, 2000);
    return () => clearInterval(statusInterval);
  }, []);

  /**
   * Poll batch status when on developer tab
   */
  useEffect(() => {
    if (activeTab !== 'developer') return;

    const fetchBatchStatus = async () => {
      try {
        const resp = await sendToBackground({ type: MESSAGE_TYPES.GET_BATCH_STATUS });
        if (resp.success && resp.data) {
          setBatchStatus(resp.data);
        }
      } catch {
        // silently fail
      }
    };

    fetchBatchStatus();
    const interval = setInterval(fetchBatchStatus, 1500);
    return () => clearInterval(interval);
  }, [activeTab]);

  /**
   * Load credentials from background
   */
  async function fetchCredentials() {
    try {
      setConnectionStatus('loading');

      const response = await sendToBackground({
        type: MESSAGE_TYPES.GET_CREDENTIALS
      });

      if (response.success && response.data?.credentials) {
        setCredentials(response.data.credentials);
        setCredentialCount(response.data.credentials.length);
        setConnectionStatus('connected');
        setStatusMessage('Connected');
      } else {
        setConnectionStatus('error');
        setStatusMessage(response.error || 'Failed to fetch credentials');
      }
    } catch (error) {
      setConnectionStatus('error');
      if (error instanceof TimeoutError) {
        setStatusMessage('Connection timeout');
      } else if (error instanceof Error) {
        setStatusMessage(error.message);
      } else {
        setStatusMessage('Unknown error');
      }
    }
  }

  /**
   * Fetch extension status from background
   */
  async function fetchStatus() {
    try {
      const response = await sendToBackground(
        { type: MESSAGE_TYPES.GET_STATUS },
        2000
      );

      if (response.success && response.data) {
        setExtensionStatus(response.data.status);
      }
    } catch (error) {
      console.log('Status polling error:', error);
    }
  }

  /**
   * Handle refresh button click
   */
  async function handleRefresh() {
    await fetchCredentials();
  }

  /**
   * Start batch login
   */
  async function handleStartBatch() {
    setDevMessage('Starting batch...');
    const resp = await sendToBackground({
      type: MESSAGE_TYPES.START_BATCH_LOGIN,
      data: { delayBetweenMs: loginDelay * 1000 }
    });
    setDevMessage(resp.success ? 'Batch started' : (resp.error ?? 'Error'));
  }

  /**
   * Stop batch login
   */
  async function handleStopBatch() {
    await sendToBackground({ type: MESSAGE_TYPES.STOP_BATCH_LOGIN });
    setDevMessage('Batch stopped');
  }

  /**
   * Resume batch login after CAPTCHA
   */
  async function handleResumeBatch() {
    setDevMessage('Resuming batch...');
    const resp = await sendToBackground({
      type: MESSAGE_TYPES.RESUME_BATCH_LOGIN
    });
    setDevMessage(resp.success ? 'Batch resumed' : (resp.error ?? 'Error'));
    // Refresh status
    setTimeout(fetchStatus, 1000);
  }

  /**
   * Load development logs
   */
  async function handleLoadDevLogs() {
    const resp = await sendToBackground({
      type: MESSAGE_TYPES.DEV_GET_LOGS,
      data: { limit: 50 }
    });
    if (resp.success && resp.data?.logs) {
      setDevLogs(resp.data.logs);
    }
  }

  /**
   * Clear all extension data
   */
  async function handleClearData() {
    if (!window.confirm('Clear ALL extension data? This cannot be undone.')) return;
    const resp = await sendToBackground({ type: MESSAGE_TYPES.DEV_CLEAR_DATA });
    setDevMessage(resp.success ? 'All data cleared' : 'Clear failed');
    await fetchCredentials();
  }

  /**
   * Handle delay change
   */
  function handleDelayChange(value: number) {
    setLoginDelay(value);
    chrome.storage.local.set({ dev_login_delay_seconds: value });
  }

  /**
   * Get status badge color
   */
  function getStatusColor(status: string): string {
    switch (status) {
      case 'SUCCESS':
        return '#28a745';
      case 'WRONG_PASSWORD':
      case 'BLOCKED_BY_BOT_DETECTION':
      case 'EXPIRED_ACCOUNT':
        return '#dc3545';
      case 'CAPTCHA_TIMEOUT':
        return '#ffc107';
      case 'FORM_NOT_FOUND':
      case 'NETWORK_ERROR':
        return '#6c757d';
      default:
        return '#1a73e8';
    }
  }

  /**
   * Get status icon
   */
  function getStatusIcon(status: string): string {
    switch (status) {
      case 'SUCCESS':
        return '●';
      case 'CAPTCHA_TIMEOUT':
        return '⚠';
      default:
        return '✗';
    }
  }

  return (
    <div style={{ padding: '20px', minWidth: '500px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ margin: '0 0 5px 0', fontSize: '24px', color: '#1a73e8' }}>AutoLogin</h1>
      <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#999' }}>Batch login automation</p>

      {/* Tab Bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '2px solid #dadce0',
          marginBottom: '16px',
          gap: '0'
        }}
      >
        {(['overview', 'developer'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '10px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '3px solid #1a73e8' : '3px solid transparent',
              color: activeTab === tab ? '#1a73e8' : '#666',
              fontWeight: activeTab === tab ? '600' : '400',
              cursor: 'pointer',
              fontSize: '13px',
              textTransform: 'capitalize',
              marginBottom: '-2px'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Connection Status */}
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              background:
                connectionStatus === 'connected'
                  ? '#d4edda'
                  : connectionStatus === 'error'
                    ? '#f8d7da'
                    : '#e2e3e5',
              borderRadius: '4px',
              border: `1px solid ${connectionStatus === 'connected' ? '#c3e6cb' : connectionStatus === 'error' ? '#f5c6cb' : '#d6d8db'}`
            }}
          >
            <h2 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 8px 0', color: '#333' }}>
              Connection Status
            </h2>
            <div style={{ fontSize: '14px', color: '#555' }}>
              {connectionStatus === 'loading' && '🔄 Connecting...'}
              {connectionStatus === 'connected' && '✅ Connected'}
              {connectionStatus === 'error' && '❌ Disconnected'}
            </div>
            {statusMessage && <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>{statusMessage}</div>}
          </div>

          {/* Extension Status */}
          {extensionStatus !== 'idle' && (
            <div
              style={{
                marginTop: '12px',
                padding: '12px',
                background: '#fff3cd',
                borderRadius: '4px',
                border: '1px solid #ffc107'
              }}
            >
              <h2 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 8px 0', color: '#333' }}>
                Extension Status
              </h2>
              <div style={{ fontSize: '14px', color: '#555' }}>
                {extensionStatus === 'logging_in' && '🔐 Logging in...'}
                {extensionStatus === 'error' && '⚠️ Error occurred'}
              </div>
            </div>
          )}

          {/* Credentials Summary */}
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              background: '#e7f3ff',
              borderRadius: '4px',
              border: '1px solid #b3d9ff'
            }}
          >
            <h2 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 8px 0', color: '#333' }}>Accounts</h2>
            <div style={{ fontSize: '16px', fontWeight: '500', color: '#1a73e8' }}>{credentialCount} saved</div>
            {credentialCount > 0 && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                <p style={{ margin: '4px 0' }}>Recent accounts:</p>
                {credentials.slice(0, 3).map((cred, idx) => {
                  // Parse hostname safely - handle URLs with or without protocol
                  let hostname = cred.url;
                  try {
                    const fullUrl = cred.url.startsWith('http') ? cred.url : `https://${cred.url}`;
                    hostname = new URL(fullUrl).hostname || cred.url;
                  } catch {
                    // If parsing fails, use URL as-is
                    hostname = cred.url;
                  }
                  return (
                    <div
                      key={idx}
                      style={{ margin: '4px 0', paddingLeft: '8px', borderLeft: '2px solid #1a73e8' }}
                    >
                      {cred.username} @ {hostname}
                    </div>
                  );
                })}
                {credentialCount > 3 && (
                  <div style={{ margin: '8px 0', fontSize: '12px', color: '#1a73e8', fontWeight: '500' }}>
                    +{credentialCount - 3} more
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
            <button
              onClick={handleRefresh}
              disabled={connectionStatus === 'loading'}
              style={{
                padding: '8px 16px',
                background: '#1a73e8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: connectionStatus === 'loading' ? 'not-allowed' : 'pointer',
                opacity: connectionStatus === 'loading' ? 0.6 : 1,
                fontSize: '13px',
                fontWeight: '500',
                flex: 1
              }}
            >
              {connectionStatus === 'loading' ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={() => {
                chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
                window.close();
              }}
              style={{
                padding: '8px 16px',
                background: '#f8f9fa',
                color: '#202124',
                border: '1px solid #dadce0',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                flex: 1
              }}
            >
              Manage
            </button>
          </div>

          {/* Footer */}
          <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #dadce0' }}>
            <p style={{ fontSize: '11px', color: '#999', margin: 0 }}>
              Version: 1.0.0 • Build: Development
              <br />
              <span style={{ fontSize: '10px' }}>✅ Foundation • ✅ Database • ✅ Messaging • ✅ Batch</span>
            </p>
          </div>
        </>
      )}

      {/* Developer Tab */}
      {activeTab === 'developer' && (
        <>
          {/* Batch Control */}
          <div style={{ marginTop: '12px', padding: '12px', background: '#f0f0f0', borderRadius: '4px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 10px 0' }}>Batch Control</h2>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                onClick={handleStartBatch}
                disabled={batchStatus.status === 'running' || batchStatus.status === 'paused'}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: (batchStatus.status === 'running' || batchStatus.status === 'paused') ? '#ccc' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (batchStatus.status === 'running' || batchStatus.status === 'paused') ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                ▶ Start All
              </button>
              {batchStatus.status === 'paused' && (
                <button
                  onClick={handleResumeBatch}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: '#ffc107',
                    color: '#333',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}
                >
                  ⏩ Continue
                </button>
              )}
              <button
                onClick={handleStopBatch}
                disabled={batchStatus.status !== 'running' && batchStatus.status !== 'paused'}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: (batchStatus.status !== 'running' && batchStatus.status !== 'paused') ? '#ccc' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (batchStatus.status !== 'running' && batchStatus.status !== 'paused') ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                ■ Stop
              </button>
            </div>

            <div style={{ fontSize: '12px', color: '#333', marginBottom: '8px' }}>
              <strong>Status:</strong>{' '}
              {batchStatus.status === 'running'
                ? `Running ${batchStatus.completed} / ${batchStatus.total}`
                : batchStatus.status === 'paused'
                  ? `⏸️ Paused at ${batchStatus.current} (solve CAPTCHA and click Continue)`
                  : batchStatus.status === 'done'
                    ? `Done ${batchStatus.total} / ${batchStatus.total}`
                    : 'Idle'}
            </div>

            {batchStatus.current && (
              <div style={{ fontSize: '12px', color: '#666', backgroundColor: '#fff', padding: '6px', borderRadius: '3px' }}>
                <strong>Current:</strong> {batchStatus.current}
              </div>
            )}

            {devMessage && (
              <div style={{ fontSize: '11px', color: '#1a73e8', marginTop: '8px', fontStyle: 'italic' }}>
                {devMessage}
              </div>
            )}
          </div>

          {/* Configuration */}
          <div style={{ marginTop: '12px', padding: '12px', background: '#f0f0f0', borderRadius: '4px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 10px 0' }}>Configuration</h2>

            <label style={{ display: 'block', marginBottom: '10px', fontSize: '12px' }}>
              <strong>Delay between logins:</strong>
              <br />
              <input
                type="number"
                min="1"
                max="60"
                value={loginDelay}
                onChange={e => handleDelayChange(parseInt(e.target.value) || 1)}
                style={{
                  width: '60px',
                  padding: '4px 8px',
                  marginTop: '4px',
                  borderRadius: '3px',
                  border: '1px solid #ccc'
                }}
              />{' '}
              seconds
            </label>

            <div style={{ fontSize: '11px', color: '#666', backgroundColor: '#fff', padding: '8px', borderRadius: '3px', marginBottom: '10px' }}>
              <strong>⚠ File Output Path:</strong>
              <br />
              Files save to: <code style={{ background: '#f5f5f5', padding: '2px 4px' }}>logscomplete\(hostname)-correct.txt</code>
              <br />
              <span style={{ color: '#d9534f' }}>
                Set browser Downloads folder to <code style={{ background: '#f5f5f5', padding: '2px 4px' }}>C:\users\taimoor\</code> for correct path
              </span>
            </div>

            <button
              onClick={handleClearData}
              style={{
                width: '100%',
                padding: '8px',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500'
              }}
            >
              Clear All Data
            </button>
          </div>

          {/* Recent Results */}
          <div style={{ marginTop: '12px', padding: '12px', background: '#f0f0f0', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '600', margin: '0' }}>Recent Results</h2>
              <button
                onClick={handleLoadDevLogs}
                style={{
                  padding: '4px 10px',
                  background: '#1a73e8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                Refresh
              </button>
            </div>

            <div
              style={{
                maxHeight: '200px',
                overflowY: 'auto',
                backgroundColor: '#fff',
                borderRadius: '3px',
                padding: '8px'
              }}
            >
              {devLogs.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#999', textAlign: 'center', padding: '20px' }}>
                  No logs yet
                </div>
              ) : (
                devLogs.map((log, idx) => {
                  const time = new Date(log.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  return (
                    <div
                      key={idx}
                      style={{
                        fontSize: '11px',
                        marginBottom: '4px',
                        padding: '4px 6px',
                        backgroundColor: getStatusColor(log.status),
                        color: 'white',
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span>
                        {getStatusIcon(log.status)} {log.status} {time}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
