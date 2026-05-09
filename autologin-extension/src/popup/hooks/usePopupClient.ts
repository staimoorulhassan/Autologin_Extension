/**
 * Task 4: usePopupClient Hook
 * React hook that provides PopupClient instance and manages credential state
 */

import { useEffect, useState, useRef } from 'react';
import { PopupClient } from '../../messaging/popupClient';
import { MessageSystem } from '../../messaging/messageSystem';
import type { Credential, LoginLog, Cookie } from '../../types';

interface UsePopupClientResult {
  credentials: Credential[];
  isLoading: boolean;
  error?: Error;
  addCredential: (credential: Credential) => Promise<string>;
  updateCredential: (id: string, updates: Partial<Credential>) => Promise<void>;
  deleteCredential: (id: string) => Promise<void>;
  startLogin: (accountId: string) => Promise<void>;
  getLoginHistory: (accountId: string, limit?: number) => Promise<LoginLog[]>;
  exportLogs: () => Promise<string>;
  saveCookies: (accountId: string, cookies: Cookie[]) => Promise<number>;
  loadCookies: (accountId: string) => Promise<Cookie[]>;
}

/**
 * Hook that provides PopupClient instance and manages popup state
 */
export function usePopupClient(): UsePopupClientResult {
  const clientRef = useRef<PopupClient | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error>();

  // Initialize PopupClient on mount
  useEffect(() => {
    if (!clientRef.current) {
      const messageSystem = new MessageSystem();
      clientRef.current = new PopupClient(messageSystem);
    }

    // Fetch credentials on mount
    fetchCredentials();
  }, []);

  async function fetchCredentials() {
    try {
      setIsLoading(true);
      setError(undefined);
      const creds = await clientRef.current!.getCredentials();
      setCredentials(creds);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }

  async function addCredential(credential: Credential): Promise<string> {
    try {
      setError(undefined);
      const id = await clientRef.current!.addCredential(credential);
      await fetchCredentials(); // Refresh list
      return id;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }

  async function updateCredential(id: string, updates: Partial<Credential>): Promise<void> {
    try {
      setError(undefined);
      await clientRef.current!.updateCredential(id, updates);
      await fetchCredentials(); // Refresh list
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }

  async function deleteCredential(id: string): Promise<void> {
    try {
      setError(undefined);
      await clientRef.current!.deleteCredential(id);
      await fetchCredentials(); // Refresh list
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }

  async function startLogin(accountId: string): Promise<void> {
    try {
      setError(undefined);
      await clientRef.current!.startLogin(accountId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }

  async function getLoginHistory(accountId: string, limit?: number): Promise<LoginLog[]> {
    try {
      setError(undefined);
      return await clientRef.current!.getLoginHistory(accountId, limit);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }

  async function exportLogs(): Promise<string> {
    try {
      setError(undefined);
      return await clientRef.current!.exportLogs();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }

  async function saveCookies(accountId: string, cookies: Cookie[]): Promise<number> {
    try {
      setError(undefined);
      return await clientRef.current!.saveCookies(accountId, cookies);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }

  async function loadCookies(accountId: string): Promise<Cookie[]> {
    try {
      setError(undefined);
      return await clientRef.current!.loadCookies(accountId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }

  return {
    credentials,
    isLoading,
    error,
    addCredential,
    updateCredential,
    deleteCredential,
    startLogin,
    getLoginHistory,
    exportLogs,
    saveCookies,
    loadCookies,
  };
}
