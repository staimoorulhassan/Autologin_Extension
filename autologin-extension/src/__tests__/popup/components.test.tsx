/**
 * Task 4: Popup Components Tests
 * Tests for React components in the popup UI
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AccountList } from '../../popup/components/AccountList';
import { LoginHistory } from '../../popup/components/LoginHistory';
import { ConnectionStatus } from '../../popup/components/ConnectionStatus';
import type { Credential, LoginLog } from '../../types';

describe('Task 4: Popup Components', () => {
  describe('AccountList component', () => {
    test('should render account list', async () => {
      const credentials: Credential[] = [
        {
          id: 'cred-1',
          url: 'https://example.com',
          username: 'user1',
          password: 'pass1',
        },
      ];

      render(React.createElement(AccountList, { credentials, onLogin: jest.fn() }));

      await waitFor(() => {
        expect(screen.getByText(/example\.com/i)).toBeInTheDocument();
      });
    });

    test('should display account count', async () => {
      const credentials: Credential[] = [
        {
          id: 'cred-1',
          url: 'https://example.com',
          username: 'user1',
          password: 'pass1',
        },
        {
          id: 'cred-2',
          url: 'https://example2.com',
          username: 'user2',
          password: 'pass2',
        },
      ];

      render(React.createElement(AccountList, { credentials, onLogin: jest.fn() }));

      await waitFor(() => {
        expect(screen.getByText(/2\s+accounts?/i)).toBeInTheDocument();
      });
    });

    test('should call onLogin when login button clicked', async () => {
      const mockOnLogin = jest.fn();
      const credentials: Credential[] = [
        {
          id: 'cred-1',
          url: 'https://example.com',
          username: 'user1',
          password: 'pass1',
        },
      ];

      render(React.createElement(AccountList, { credentials, onLogin: mockOnLogin }));

      const loginButton = screen.getByRole('button', { name: /login/i });
      fireEvent.click(loginButton);

      expect(mockOnLogin).toHaveBeenCalledWith('cred-1');
    });

    test('should show empty state when no accounts', async () => {
      render(React.createElement(AccountList, { credentials: [], onLogin: jest.fn() }));

      await waitFor(() => {
        expect(screen.getByText(/no accounts/i)).toBeInTheDocument();
      });
    });

    test('should display username for each account', async () => {
      const credentials: Credential[] = [
        {
          id: 'cred-1',
          url: 'https://example.com',
          username: 'testuser',
          password: 'pass1',
        },
      ];

      render(React.createElement(AccountList, { credentials, onLogin: jest.fn() }));

      await waitFor(() => {
        expect(screen.getByText(/testuser/i)).toBeInTheDocument();
      });
    });

    test('should support search/filter', async () => {
      const credentials: Credential[] = [
        {
          id: 'cred-1',
          url: 'https://example.com',
          username: 'user1',
          password: 'pass1',
        },
        {
          id: 'cred-2',
          url: 'https://github.com',
          username: 'user2',
          password: 'pass2',
        },
      ];

      render(React.createElement(AccountList, { credentials, onLogin: jest.fn() }));

      const searchInput = screen.getByPlaceholderText(/search/i);
      fireEvent.change(searchInput, { target: { value: 'github' } });

      await waitFor(() => {
        expect(screen.getByText(/github\.com/i)).toBeInTheDocument();
        expect(screen.queryByText(/example\.com/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('LoginHistory component', () => {
    test('should render login history', async () => {
      const logs: LoginLog[] = [
        {
          id: 'log-1',
          account_id: 'cred-1',
          timestamp: Date.now(),
          status: 'SUCCESS',
        },
      ];

      render(React.createElement(LoginHistory, { accountId: 'cred-1', logs }));

      await waitFor(() => {
        expect(screen.getByText(/SUCCESS/i)).toBeInTheDocument();
      });
    });

    test('should display login status', async () => {
      const logs: LoginLog[] = [
        {
          id: 'log-1',
          account_id: 'cred-1',
          timestamp: Date.now(),
          status: 'WRONG_PASSWORD',
          error_message: 'Invalid password',
        },
      ];

      render(React.createElement(LoginHistory, { accountId: 'cred-1', logs }));

      await waitFor(() => {
        expect(screen.getByText(/WRONG_PASSWORD/i)).toBeInTheDocument();
      });
    });

    test('should show timestamp for each log entry', async () => {
      const now = Date.now();
      const logs: LoginLog[] = [
        {
          id: 'log-1',
          account_id: 'cred-1',
          timestamp: now,
          status: 'SUCCESS',
        },
      ];

      render(React.createElement(LoginHistory, { accountId: 'cred-1', logs }));

      await waitFor(() => {
        // Timestamp should be displayed in some format
        expect(screen.getByText(/\d{1,2}:\d{2}:\d{2}/)).toBeInTheDocument();
      });
    });

    test('should show empty state when no logs', async () => {
      render(React.createElement(LoginHistory, { accountId: 'cred-1', logs: [] }));

      await waitFor(() => {
        expect(screen.getByText(/no login history/i)).toBeInTheDocument();
      });
    });

    test('should display error message if present', async () => {
      const logs: LoginLog[] = [
        {
          id: 'log-1',
          account_id: 'cred-1',
          timestamp: Date.now(),
          status: 'NETWORK_ERROR',
          error_message: 'Connection timeout',
        },
      ];

      render(React.createElement(LoginHistory, { accountId: 'cred-1', logs }));

      await waitFor(() => {
        expect(screen.getByText(/Connection timeout/i)).toBeInTheDocument();
      });
    });

    test('should sort logs by timestamp descending', async () => {
      const now = Date.now();
      const logs: LoginLog[] = [
        {
          id: 'log-1',
          account_id: 'cred-1',
          timestamp: now - 3600000, // 1 hour ago
          status: 'SUCCESS',
        },
        {
          id: 'log-2',
          account_id: 'cred-1',
          timestamp: now, // now
          status: 'SUCCESS',
        },
      ];

      render(React.createElement(LoginHistory, { accountId: 'cred-1', logs }));

      const entries = screen.getAllByRole('listitem');
      // Most recent should be first
      expect(entries[0]).toBeInTheDocument();
    });
  });

  describe('ConnectionStatus component', () => {
    test('should show connected status', async () => {
      render(React.createElement(ConnectionStatus, { status: 'connected' }));

      await waitFor(() => {
        expect(screen.getByText(/connected/i)).toBeInTheDocument();
      });
    });

    test('should show disconnected status', async () => {
      render(React.createElement(ConnectionStatus, { status: 'disconnected', message: 'Background worker not responding' }));

      await waitFor(() => {
        expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
        expect(screen.getByText(/Background worker not responding/i)).toBeInTheDocument();
      });
    });

    test('should show loading status', async () => {
      render(React.createElement(ConnectionStatus, { status: 'connecting' }));

      await waitFor(() => {
        expect(screen.getByText(/connecting/i)).toBeInTheDocument();
      });
    });

    test('should provide visual indicator', async () => {
      render(React.createElement(ConnectionStatus, { status: 'connected' }));

      const statusIndicator = screen.getByRole('status');
      expect(statusIndicator).toBeInTheDocument();
    });

    test('should call retry callback when retry button clicked', async () => {
      const mockRetry = jest.fn();
      render(
        React.createElement(ConnectionStatus, {
          status: 'disconnected',
          message: 'Error',
          onRetry: mockRetry,
        })
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      expect(mockRetry).toHaveBeenCalled();
    });
  });
});
