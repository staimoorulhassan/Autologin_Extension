/**
 * Task 4: useConnectionStatus Hook
 * React hook that monitors connection to background worker
 */

import { useEffect, useState, useRef } from 'react';
import { PopupClient } from '../../messaging/popupClient';
import { MessageSystem } from '../../messaging/messageSystem';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface UseConnectionStatusResult {
  status: ConnectionStatus;
  message?: string;
  retry: () => Promise<void>;
}

/**
 * Hook that monitors background worker connection status
 */
export function useConnectionStatus(): UseConnectionStatusResult {
  const clientRef = useRef<PopupClient | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [message, setMessage] = useState<string>();
  const retryCountRef = useRef(0);

  // Initialize and check connection on mount
  useEffect(() => {
    if (!clientRef.current) {
      const messageSystem = new MessageSystem();
      clientRef.current = new PopupClient(messageSystem);
    }

    checkConnection();

    // Poll connection every 5 seconds
    const interval = setInterval(checkConnection, 5000);

    return () => clearInterval(interval);
  }, []);

  async function checkConnection(): Promise<void> {
    try {
      setStatus('connecting');
      const alive = await clientRef.current!.ping();

      if (alive) {
        setStatus('connected');
        setMessage(undefined);
        retryCountRef.current = 0;
      } else {
        setStatus('disconnected');
        setMessage('Background worker not responding');
      }
    } catch (error) {
      setStatus('disconnected');
      setMessage(
        error instanceof Error ? error.message : 'Failed to connect to background worker'
      );
    }
  }

  async function retry(): Promise<void> {
    retryCountRef.current++;
    await checkConnection();
  }

  return {
    status,
    message,
    retry,
  };
}
