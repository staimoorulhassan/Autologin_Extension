/**
 * Popup React Component
 * Main UI for account management and login controls
 * Includes live AI feed, escalation UI, and AI Chat
 */

import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { sendToBackground, MESSAGE_TYPES, TimeoutError } from '@messaging/index';
import type { BatchProgress } from '@messaging/types';
import type { Credential, LoginLog } from '../types/index';
import AiChat from './components/AiChat';

type TabType = 'overview' | 'developer' | 'ai';

interface AiFeedEntry {
  id: string;
  accountId: string;
  username: string;
  hostname: string;
  commentary: string;
  action: string;
  timestamp: number;
}

const ACTION_ICONS: Record<string, string> = {
  start: '▶',
  type: '✍',
  click: '👆',
  wait: '⏳',
  report_success: '✅',
  report_failure: '❌',
  report_captcha: '🤖',
  escalate: '⚠',
  user_instruction: '💬',
  error: '⚡',
};

function App() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialCount, setCredentialCount] = useState<number>(0);
  const [connectionStatus, setConnectionStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [, setExtensionStatus] = useState<'idle' | 'logging_in' | 'error'>('idle');

  const [activeTab, setActiveTab] = useState<TabType>('developer');
  const [batchStatus, setBatchStatus] = useState<BatchProgress>({ total: 0, completed: 0, status: 'idle' });
  const [devLogs, setDevLogs] = useState<LoginLog[]>([]);
  const [loginDelay, setLoginDelay] = useState<number>(3);
  const [devMessage, setDevMessage] = useState<string>('');

  // AI feed state
  const [aiFeed, setAiFeed] = useState<AiFeedEntry[]>([]);
  const [userInstruction, setUserInstruction] = useState<string>('');
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.storage.local.get('dev_login_delay_seconds', (result) => {
      const val = result['dev_login_delay_seconds'];
      if (typeof val === 'number') setLoginDelay(val);
    });
  }, []);

  // Fetch credentials + status on mount, poll status
  useEffect(() => {
    fetchCredentials();
    fetchStatus();
    const statusInterval = setInterval(fetchStatus, 2000);
    return () => clearInterval(statusInterval);
  }, []);

  // Poll batch status every 1.5s when on developer tab
  useEffect(() => {
    if (activeTab !== 'developer') return;
    fetchBatchStatus();
    const interval = setInterval(fetchBatchStatus, 1500);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Poll AI feed from storage every 1.5s when on developer tab
  useEffect(() => {
    if (activeTab !== 'developer') return;
    const load = () => chrome.storage.local.get('ai_feed', (r) => {
      setAiFeed((r['ai_feed'] as AiFeedEntry[]) ?? []);
    });
    load();
    const interval = setInterval(load, 1500);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Auto-scroll feed to bottom on new entries
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [aiFeed]);

  async function fetchBatchStatus() {
    try {
      const resp = await sendToBackground({ type: MESSAGE_TYPES.GET_BATCH_STATUS });
      if (resp.success && resp.data) setBatchStatus(resp.data);
    } catch { /* silent */ }
  }

  async function fetchCredentials() {
    try {
      setConnectionStatus('loading');
      const response = await sendToBackground({ type: MESSAGE_TYPES.GET_CREDENTIALS });
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
      if (error instanceof TimeoutError) setStatusMessage('Connection timeout');
      else if (error instanceof Error) setStatusMessage(error.message);
      else setStatusMessage('Unknown error');
    }
  }

  async function fetchStatus() {
    try {
      const response = await sendToBackground({ type: MESSAGE_TYPES.GET_STATUS }, 2000);
      if (response.success && response.data) setExtensionStatus(response.data.status);
    } catch { /* silent */ }
  }

  async function handleStartBatch() {
    setDevMessage('Starting batch...');
    const resp = await sendToBackground({
      type: MESSAGE_TYPES.START_BATCH_LOGIN,
      data: { delayBetweenMs: loginDelay * 1000 }
    });
    setDevMessage(resp.success ? 'Batch started' : (resp.error ?? 'Error'));
  }

  async function handleStopBatch() {
    await sendToBackground({ type: MESSAGE_TYPES.STOP_BATCH_LOGIN });
    setDevMessage('Batch stopped');
  }

  async function handleResumeBatch() {
    setDevMessage('Resuming...');
    const resp = await sendToBackground({ type: MESSAGE_TYPES.RESUME_BATCH_LOGIN });
    setDevMessage(resp.success ? 'Resumed' : (resp.error ?? 'Error'));
  }

  async function handleSendInstruction() {
    const inst = userInstruction.trim();
    if (!inst) return;
    setDevMessage('Sending instruction...');
    const resp = await sendToBackground({
      type: MESSAGE_TYPES.USER_INSTRUCTION,
      data: { instruction: inst }
    });
    setUserInstruction('');
    setDevMessage(resp.success ? 'Instruction sent — resuming' : (resp.error ?? 'Error'));
  }

  async function handleLoadDevLogs() {
    const resp = await sendToBackground({ type: MESSAGE_TYPES.DEV_GET_LOGS, data: { limit: 50 } });
    if (resp.success && resp.data?.logs) setDevLogs(resp.data.logs);
  }

  async function handleClearData() {
    if (!window.confirm('Clear ALL extension data? This cannot be undone.')) return;
    const resp = await sendToBackground({ type: MESSAGE_TYPES.DEV_CLEAR_DATA });
    setDevMessage(resp.success ? 'All data cleared' : 'Clear failed');
    setAiFeed([]);
    await fetchCredentials();
  }

  function handleDelayChange(value: number) {
    setLoginDelay(value);
    chrome.storage.local.set({ dev_login_delay_seconds: value });
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'SUCCESS': return '#28a745';
      case 'WRONG_PASSWORD': case 'BLOCKED_BY_BOT_DETECTION': case 'EXPIRED_ACCOUNT': return '#dc3545';
      case 'CAPTCHA_TIMEOUT': return '#ffc107';
      default: return '#6c757d';
    }
  }

  function getBatchStatusLabel(): string {
    switch (batchStatus.status) {
      case 'running': return `Running ${batchStatus.completed} / ${batchStatus.total}`;
      case 'captcha_pause': return `⏸ CAPTCHA pause — solve then Continue`;
      case 'waiting_instruction': return `⚠ Waiting for your instruction`;
      case 'done': return `Done ${batchStatus.total} / ${batchStatus.total}`;
      case 'stopped': return 'Stopped';
      default: return 'Idle';
    }
  }

  const isRunning = batchStatus.status === 'running' || batchStatus.status === 'captcha_pause';
  const canStart = !isRunning && batchStatus.status !== 'waiting_instruction';
  const canStop = isRunning;

  return (
    <div style={{ padding: '16px', minWidth: '500px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ margin: '0 0 4px 0', fontSize: '22px', color: '#1a73e8' }}>AutoLogin</h1>
      <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: '#999' }}>AI-orchestrated batch login</p>

      {/* Tab Bar */}
      <div style={{ display: 'flex', borderBottom: '2px solid #dadce0', marginBottom: '14px' }}>
        {(['overview', 'developer', 'ai'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex: 1, padding: '9px', background: 'none', border: 'none',
            borderBottom: activeTab === tab ? '3px solid #1a73e8' : '3px solid transparent',
            color: activeTab === tab ? '#1a73e8' : '#666',
            fontWeight: activeTab === tab ? '600' : '400',
            cursor: 'pointer', fontSize: '13px', textTransform: 'capitalize', marginBottom: '-2px'
          }}>
            {tab === 'ai' ? 'AI Chat' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* OVERVIEW TAB                                                      */}
      {/* ================================================================ */}
      {activeTab === 'overview' && (
        <>
          <div style={{
            padding: '12px', borderRadius: '4px', border: '1px solid',
            background: connectionStatus === 'connected' ? '#d4edda' : connectionStatus === 'error' ? '#f8d7da' : '#e2e3e5',
            borderColor: connectionStatus === 'connected' ? '#c3e6cb' : connectionStatus === 'error' ? '#f5c6cb' : '#d6d8db'
          }}>
            <strong style={{ fontSize: '13px' }}>Connection</strong>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>
              {connectionStatus === 'loading' && '🔄 Connecting...'}
              {connectionStatus === 'connected' && '✅ Connected'}
              {connectionStatus === 'error' && '❌ Disconnected'}
            </div>
            {statusMessage && <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>{statusMessage}</div>}
          </div>

          <div style={{ marginTop: '10px', padding: '12px', background: '#e7f3ff', borderRadius: '4px', border: '1px solid #b3d9ff' }}>
            <strong style={{ fontSize: '13px' }}>Accounts</strong>
            <div style={{ fontSize: '16px', fontWeight: '500', color: '#1a73e8', marginTop: '4px' }}>{credentialCount} saved</div>
            {credentials.slice(0, 3).map((cred, idx) => {
              let hostname = cred.url;
              try { hostname = new URL(cred.url.startsWith('http') ? cred.url : `https://${cred.url}`).hostname; } catch { /* use url */ }
              return (
                <div key={idx} style={{ fontSize: '12px', marginTop: '4px', paddingLeft: '8px', borderLeft: '2px solid #1a73e8' }}>
                  {cred.username} @ {hostname}
                </div>
              );
            })}
            {credentialCount > 3 && <div style={{ fontSize: '12px', color: '#1a73e8', marginTop: '4px' }}>+{credentialCount - 3} more</div>}
          </div>

          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button onClick={fetchCredentials} style={{
              flex: 1, padding: '8px', background: '#1a73e8', color: 'white', border: 'none',
              borderRadius: '4px', cursor: 'pointer', fontSize: '13px'
            }}>Refresh</button>
            <button onClick={() => { chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }); window.close(); }} style={{
              flex: 1, padding: '8px', background: '#f8f9fa', color: '#202124',
              border: '1px solid #dadce0', borderRadius: '4px', cursor: 'pointer', fontSize: '13px'
            }}>Manage Accounts</button>
          </div>

          <div style={{ marginTop: '16px', paddingTop: '10px', borderTop: '1px solid #dadce0' }}>
            <p style={{ fontSize: '11px', color: '#999', margin: 0 }}>
              v1.0 — AI-Orchestrated Batch Login
            </p>
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* DEVELOPER TAB                                                     */}
      {/* ================================================================ */}
      {activeTab === 'developer' && (
        <>
          {/* Escalation / Instruction UI */}
          {batchStatus.status === 'waiting_instruction' && (
            <div style={{
              background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px',
              padding: '12px', marginBottom: '12px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#856404', marginBottom: '6px' }}>
                ⚠ AI needs your help with {batchStatus.escalationHostname}
              </div>
              <div style={{ fontSize: '12px', color: '#555', marginBottom: '8px', lineHeight: 1.4 }}>
                {batchStatus.escalationReason || '3 consecutive login failures.'}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={userInstruction}
                  onChange={e => setUserInstruction(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendInstruction()}
                  placeholder='e.g. "Accept cookies first then click Sign In"'
                  style={{
                    flex: 1, padding: '7px 10px', border: '1px solid #ffc107',
                    borderRadius: '4px', fontSize: '12px', outline: 'none'
                  }}
                />
                <button
                  onClick={handleSendInstruction}
                  disabled={!userInstruction.trim()}
                  style={{
                    padding: '7px 14px', background: userInstruction.trim() ? '#ffc107' : '#ccc',
                    color: '#333', border: 'none', borderRadius: '4px',
                    cursor: userInstruction.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '12px', fontWeight: '600', flexShrink: 0
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {/* Batch Control */}
          <div style={{ padding: '12px', background: '#f0f0f0', borderRadius: '4px' }}>
            <strong style={{ fontSize: '13px', display: 'block', marginBottom: '10px' }}>Batch Control</strong>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button onClick={handleStartBatch} disabled={!canStart} style={{
                flex: 1, padding: '10px', background: canStart ? '#28a745' : '#ccc',
                color: 'white', border: 'none', borderRadius: '4px',
                cursor: canStart ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: '500'
              }}>▶ Start All</button>

              {batchStatus.status === 'captcha_pause' && (
                <button onClick={handleResumeBatch} style={{
                  flex: 1, padding: '10px', background: '#ffc107', color: '#333',
                  border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500'
                }}>⏩ Continue</button>
              )}

              <button onClick={handleStopBatch} disabled={!canStop} style={{
                flex: 1, padding: '10px', background: canStop ? '#dc3545' : '#ccc',
                color: 'white', border: 'none', borderRadius: '4px',
                cursor: canStop ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: '500'
              }}>■ Stop</button>
            </div>

            <div style={{ fontSize: '12px', color: '#333' }}>
              <strong>Status:</strong> {getBatchStatusLabel()}
            </div>
            {batchStatus.current && (
              <div style={{ fontSize: '11px', color: '#555', background: '#fff', padding: '5px 8px', borderRadius: '3px', marginTop: '6px' }}>
                <strong>Current:</strong> {batchStatus.current}
              </div>
            )}
            {devMessage && (
              <div style={{ fontSize: '11px', color: '#1a73e8', marginTop: '6px', fontStyle: 'italic' }}>
                {devMessage}
              </div>
            )}
          </div>

          {/* Live AI Feed */}
          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#333' }}>
              Live AI Feed
              {aiFeed.length > 0 && (
                <span style={{ fontSize: '10px', color: '#999', fontWeight: '400', marginLeft: '6px' }}>
                  ({aiFeed.length} entries)
                </span>
              )}
            </div>
            <div
              ref={feedRef}
              style={{
                height: '200px', overflowY: 'auto', background: '#1a1a2e',
                borderRadius: '6px', padding: '8px', display: 'flex',
                flexDirection: 'column', gap: '4px'
              }}
            >
              {aiFeed.length === 0 ? (
                <div style={{ color: '#555', fontSize: '11px', textAlign: 'center', marginTop: '80px' }}>
                  No activity yet — start a batch to see live AI commentary
                </div>
              ) : (
                aiFeed.map(entry => {
                  const icon = ACTION_ICONS[entry.action] || '•';
                  const isSystem = entry.action === 'start' || entry.action === 'escalate';
                  const isUserInst = entry.action === 'user_instruction';
                  const isSuccess = entry.action === 'report_success';
                  const isError = entry.action === 'report_failure' || entry.action === 'error';

                  const color = isSuccess ? '#28a745' : isError ? '#dc3545' : isSystem ? '#888' : isUserInst ? '#ffc107' : '#a0c4ff';

                  return (
                    <div key={entry.id} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                      <span style={{ color, fontSize: '11px', flexShrink: 0, paddingTop: '1px' }}>{icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ color: '#666', fontSize: '10px' }}>
                          {entry.hostname !== 'user' ? `${entry.username}@${entry.hostname} ` : ''}
                        </span>
                        <span style={{ color: '#e0e0e0', fontSize: '11px', lineHeight: 1.4 }}>
                          {entry.commentary}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Configuration */}
          <div style={{ marginTop: '10px', padding: '12px', background: '#f0f0f0', borderRadius: '4px' }}>
            <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>Configuration</strong>
            <label style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}>
              Delay between logins:
              <input
                type="number" min="1" max="60" value={loginDelay}
                onChange={e => handleDelayChange(parseInt(e.target.value) || 1)}
                style={{ width: '55px', padding: '3px 6px', marginLeft: '8px', borderRadius: '3px', border: '1px solid #ccc' }}
              /> seconds
            </label>

            <div style={{ fontSize: '11px', color: '#666', background: '#fff', padding: '6px 8px', borderRadius: '3px', marginBottom: '8px' }}>
              <strong>Files save to:</strong> <code style={{ background: '#f5f5f5', padding: '1px 3px' }}>Downloads\(hostname)-(user)-timestamp.txt</code>
            </div>

            <button onClick={handleClearData} style={{
              width: '100%', padding: '8px', background: '#dc3545', color: 'white',
              border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
            }}>Clear All Data</button>
          </div>

          {/* Recent Results */}
          <div style={{ marginTop: '10px', padding: '12px', background: '#f0f0f0', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong style={{ fontSize: '13px' }}>Recent Results</strong>
              <button onClick={handleLoadDevLogs} style={{
                padding: '3px 10px', background: '#1a73e8', color: 'white',
                border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px'
              }}>Refresh</button>
            </div>
            <div style={{ maxHeight: '160px', overflowY: 'auto', background: '#fff', borderRadius: '3px', padding: '6px' }}>
              {devLogs.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#999', textAlign: 'center', padding: '16px' }}>No logs yet</div>
              ) : (
                devLogs.map((log, idx) => (
                  <div key={idx} style={{
                    fontSize: '11px', marginBottom: '3px', padding: '3px 6px',
                    background: getStatusColor(log.status), color: 'white', borderRadius: '2px',
                    display: 'flex', justifyContent: 'space-between'
                  }}>
                    <span>{log.status}</span>
                    <span style={{ opacity: 0.8 }}>{new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* AI CHAT TAB                                                       */}
      {/* ================================================================ */}
      {activeTab === 'ai' && (
        <AiChat credentials={credentials} batchStatus={batchStatus} recentLogs={devLogs} />
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
