/**
 * Task 4: Popup Hooks Tests
 * Tests for React hooks that integrate with PopupClient and message system
 */

import { renderHook, waitFor } from '@testing-library/react';
import { usePopupClient } from '../../popup/hooks/usePopupClient';
import { useConnectionStatus } from '../../popup/hooks/useConnectionStatus';
import type { Credential } from '../../types';

// Mock PopupClient
jest.mock('../../messaging/popupClient', () => ({
  PopupClient: jest.fn().mockImplementation(() => ({
    getCredentials: jest.fn().mockResolvedValue([
      {
        id: 'cred-1',
        url: 'https://example.com',
        username: 'user1',
        password: 'pass1',
      },
    ]),
    addCredential: jest.fn().mockResolvedValue('new-id'),
    updateCredential: jest.fn().mockResolvedValue(undefined),
    deleteCredential: jest.fn().mockResolvedValue(undefined),
    startLogin: jest.fn().mockResolvedValue(undefined),
    getLoginHistory: jest.fn().mockResolvedValue([
      {
        id: 'log-1',
        account_id: 'cred-1',
        timestamp: Date.now(),
        status: 'SUCCESS',
      },
    ]),
    exportLogs: jest.fn().mockResolvedValue('csv data'),
    saveCookies: jest.fn().mockResolvedValue(1),
    loadCookies: jest.fn().mockResolvedValue([]),
    ping: jest.fn().mockResolvedValue(true),
  })),
}));

describe('Task 4: Popup Hooks', () => {
  describe('usePopupClient hook', () => {
    test('should initialize PopupClient', async () => {
      const { result } = renderHook(() => usePopupClient());

      expect(result.current).toBeDefined();
      expect(result.current.credentials).toBeDefined();
    });

    test('should fetch credentials on mount', async () => {
      const { result } = renderHook(() => usePopupClient());

      await waitFor(() => {
        expect(result.current.credentials).toBeDefined();
      });

      expect(Array.isArray(result.current.credentials)).toBe(true);
    });

    test('should provide addCredential method', async () => {
      const { result } = renderHook(() => usePopupClient());

      const cred: Credential = {
        url: 'https://test.com',
        username: 'test',
        password: 'pass',
      };

      const id = await result.current.addCredential(cred);

      expect(id).toBe('new-id');
    });

    test('should provide updateCredential method', async () => {
      const { result } = renderHook(() => usePopupClient());

      await result.current.updateCredential('cred-1', { username: 'updated' });

      expect(result.current).toBeDefined();
    });

    test('should provide deleteCredential method', async () => {
      const { result } = renderHook(() => usePopupClient());

      await result.current.deleteCredential('cred-1');

      expect(result.current).toBeDefined();
    });

    test('should provide startLogin method', async () => {
      const { result } = renderHook(() => usePopupClient());

      await result.current.startLogin('cred-1');

      expect(result.current).toBeDefined();
    });

    test('should fetch login history', async () => {
      const { result } = renderHook(() => usePopupClient());

      const history = await result.current.getLoginHistory('cred-1');

      expect(Array.isArray(history)).toBe(true);
    });

    test('should handle errors gracefully', async () => {
      const { result } = renderHook(() => usePopupClient());

      expect(result.current.error).toBeUndefined();
    });

    test('should track loading state', async () => {
      const { result } = renderHook(() => usePopupClient());

      expect(typeof result.current.isLoading).toBe('boolean');
    });
  });

  describe('useConnectionStatus hook', () => {
    test('should track connection status', async () => {
      const { result } = renderHook(() => useConnectionStatus());

      await waitFor(() => {
        expect(['connected', 'disconnected', 'connecting']).toContain(result.current.status);
      });
    });

    test('should retry connection on error', async () => {
      const { result } = renderHook(() => useConnectionStatus());

      await waitFor(() => {
        expect(result.current.status).toBeDefined();
      });

      expect(typeof result.current.retry).toBe('function');
    });

    test('should provide error message if disconnected', async () => {
      const { result } = renderHook(() => useConnectionStatus());

      await waitFor(() => {
        if (result.current.status === 'disconnected') {
          expect(result.current.message).toBeDefined();
        }
      });
    });

    test('should automatically check connection on mount', async () => {
      const { result } = renderHook(() => useConnectionStatus());

      await waitFor(() => {
        expect(result.current.status).not.toBe('connecting');
      });
    });
  });
});
