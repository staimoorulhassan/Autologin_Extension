/**
 * Task 5: Credential CRUD Forms Tests
 * Tests for modal forms: AddCredentialForm, EditCredentialForm, DeleteCredentialDialog
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddCredentialForm } from '../../popup/forms/AddCredentialForm';
import { EditCredentialForm } from '../../popup/forms/EditCredentialForm';
import { DeleteCredentialDialog } from '../../popup/forms/DeleteCredentialDialog';
import type { Credential } from '../../types';

describe('Task 5: Credential CRUD Forms', () => {
  describe('AddCredentialForm component', () => {
    test('should render add credential form', () => {
      const mockOnSubmit = jest.fn();
      const mockOnCancel = jest.fn();

      render(
        React.createElement(AddCredentialForm, {
          onSubmit: mockOnSubmit,
          onCancel: mockOnCancel,
        })
      );

      expect(screen.getByRole('textbox', { name: /url/i })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    test('should display form title', () => {
      render(
        React.createElement(AddCredentialForm, {
          onSubmit: jest.fn(),
          onCancel: jest.fn(),
        })
      );

      expect(screen.getByText(/add.*credential|new.*account/i)).toBeInTheDocument();
    });

    test('should call onSubmit with form data when form submitted', async () => {
      const mockOnSubmit = jest.fn();
      const user = userEvent.setup();

      render(
        React.createElement(AddCredentialForm, {
          onSubmit: mockOnSubmit,
          onCancel: jest.fn(),
        })
      );

      await user.type(screen.getByRole('textbox', { name: /url/i }), 'https://example.com');
      await user.type(screen.getByRole('textbox', { name: /username/i }), 'user1');
      await user.type(screen.getByLabelText(/password/i), 'pass123');

      const submitButton = screen.getByRole('button', { name: /add|submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          url: 'https://example.com',
          username: 'user1',
          password: 'pass123',
        });
      });
    });

    test('should call onCancel when cancel button clicked', async () => {
      const mockOnCancel = jest.fn();
      const user = userEvent.setup();

      render(
        React.createElement(AddCredentialForm, {
          onSubmit: jest.fn(),
          onCancel: mockOnCancel,
        })
      );

      const cancelButton = screen.getByRole('button', { name: /cancel|close/i });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });

    test('should validate URL field is not empty', async () => {
      const user = userEvent.setup();

      render(
        React.createElement(AddCredentialForm, {
          onSubmit: jest.fn(),
          onCancel: jest.fn(),
        })
      );

      await user.type(screen.getByRole('textbox', { name: /username/i }), 'user1');
      await user.type(screen.getByLabelText(/password/i), 'pass123');

      const submitButton = screen.getByRole('button', { name: /add|submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/url.*required|url.*missing/i)).toBeInTheDocument();
      });
    });

    test('should validate username field is not empty', async () => {
      const user = userEvent.setup();

      render(
        React.createElement(AddCredentialForm, {
          onSubmit: jest.fn(),
          onCancel: jest.fn(),
        })
      );

      await user.type(screen.getByRole('textbox', { name: /url/i }), 'https://example.com');
      await user.type(screen.getByLabelText(/password/i), 'pass123');

      const submitButton = screen.getByRole('button', { name: /add|submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/username.*required|username.*missing/i)).toBeInTheDocument();
      });
    });

    test('should validate password field is not empty', async () => {
      const user = userEvent.setup();

      render(
        React.createElement(AddCredentialForm, {
          onSubmit: jest.fn(),
          onCancel: jest.fn(),
        })
      );

      await user.type(screen.getByRole('textbox', { name: /url/i }), 'https://example.com');
      await user.type(screen.getByRole('textbox', { name: /username/i }), 'user1');

      const submitButton = screen.getByRole('button', { name: /add|submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/password.*required|password.*missing/i)).toBeInTheDocument();
      });
    });

    test('should validate URL format', async () => {
      const user = userEvent.setup();

      render(
        React.createElement(AddCredentialForm, {
          onSubmit: jest.fn(),
          onCancel: jest.fn(),
        })
      );

      await user.type(screen.getByRole('textbox', { name: /url/i }), 'invalid-url');
      await user.type(screen.getByRole('textbox', { name: /username/i }), 'user1');
      await user.type(screen.getByLabelText(/password/i), 'pass123');

      const submitButton = screen.getByRole('button', { name: /add|submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/url.*invalid|invalid.*url/i)).toBeInTheDocument();
      });
    });

    test('should clear error when user fixes field', async () => {
      const user = userEvent.setup();

      render(
        React.createElement(AddCredentialForm, {
          onSubmit: jest.fn(),
          onCancel: jest.fn(),
        })
      );

      const submitButton = screen.getByRole('button', { name: /add|submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/url.*required|url.*missing/i)).toBeInTheDocument();
      });

      await user.type(screen.getByRole('textbox', { name: /url/i }), 'https://example.com');

      await waitFor(() => {
        expect(screen.queryByText(/url.*required|url.*missing/i)).not.toBeInTheDocument();
      });
    });

    test('should disable submit button while submitting', async () => {
      const mockOnSubmit = jest.fn((): Promise<void> => new Promise(() => {})); // Never resolves
      const user = userEvent.setup();

      render(
        React.createElement(AddCredentialForm, {
          onSubmit: mockOnSubmit,
          onCancel: jest.fn(),
        })
      );

      await user.type(screen.getByRole('textbox', { name: /url/i }), 'https://example.com');
      await user.type(screen.getByRole('textbox', { name: /username/i }), 'user1');
      await user.type(screen.getByLabelText(/password/i), 'pass123');

      const submitButton = screen.getByRole('button', { name: /add|submit/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(submitButton).toBeDisabled();
      });
    });
  });

  describe('EditCredentialForm component', () => {
    test('should render edit credential form', () => {
      const credential: Credential = {
        id: 'cred-1',
        url: 'https://example.com',
        username: 'user1',
        password: 'pass1',
      };

      render(
        React.createElement(EditCredentialForm, {
          credential,
          onSubmit: jest.fn(),
          onCancel: jest.fn(),
        })
      );

      expect(screen.getByRole('textbox', { name: /url/i })).toBeInTheDocument();
    });

    test('should populate form fields with existing credential data', () => {
      const credential: Credential = {
        id: 'cred-1',
        url: 'https://example.com',
        username: 'user1',
        password: 'pass1',
      };

      render(
        React.createElement(EditCredentialForm, {
          credential,
          onSubmit: jest.fn(),
          onCancel: jest.fn(),
        })
      );

      expect((screen.getByRole('textbox', { name: /url/i }) as HTMLInputElement).value).toBe(
        'https://example.com'
      );
      expect((screen.getByRole('textbox', { name: /username/i }) as HTMLInputElement).value).toBe(
        'user1'
      );
    });

    test('should call onSubmit with updated credential data', async () => {
      const mockOnSubmit = jest.fn();
      const user = userEvent.setup();
      const credential: Credential = {
        id: 'cred-1',
        url: 'https://example.com',
        username: 'user1',
        password: 'pass1',
      };

      render(
        React.createElement(EditCredentialForm, {
          credential,
          onSubmit: mockOnSubmit,
          onCancel: jest.fn(),
        })
      );

      const urlInput = screen.getByRole('textbox', { name: /url/i });
      await user.clear(urlInput);
      await user.type(urlInput, 'https://newsite.com');

      const submitButton = screen.getByRole('button', { name: /save|update/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          id: 'cred-1',
          url: 'https://newsite.com',
          username: 'user1',
          password: 'pass1',
        });
      });
    });

    test('should display edit form title', () => {
      const credential: Credential = {
        id: 'cred-1',
        url: 'https://example.com',
        username: 'user1',
        password: 'pass1',
      };

      render(
        React.createElement(EditCredentialForm, {
          credential,
          onSubmit: jest.fn(),
          onCancel: jest.fn(),
        })
      );

      expect(screen.getByText(/edit|update.*credential|edit.*account/i)).toBeInTheDocument();
    });
  });

  describe('DeleteCredentialDialog component', () => {
    test('should render delete confirmation dialog', () => {
      const credential: Credential = {
        id: 'cred-1',
        url: 'https://example.com',
        username: 'user1',
        password: 'pass1',
      };

      render(
        React.createElement(DeleteCredentialDialog, {
          credential,
          onConfirm: jest.fn(),
          onCancel: jest.fn(),
        })
      );

      expect(screen.getByRole('button', { name: /delete|remove/i })).toBeInTheDocument();
    });

    test('should display credential URL in confirmation message', () => {
      const credential: Credential = {
        id: 'cred-1',
        url: 'https://example.com',
        username: 'user1',
        password: 'pass1',
      };

      render(
        React.createElement(DeleteCredentialDialog, {
          credential,
          onConfirm: jest.fn(),
          onCancel: jest.fn(),
        })
      );

      expect(screen.getByText(/example\.com/)).toBeInTheDocument();
    });

    test('should call onConfirm when delete button clicked', async () => {
      const mockOnConfirm = jest.fn();
      const user = userEvent.setup();
      const credential: Credential = {
        id: 'cred-1',
        url: 'https://example.com',
        username: 'user1',
        password: 'pass1',
      };

      render(
        React.createElement(DeleteCredentialDialog, {
          credential,
          onConfirm: mockOnConfirm,
          onCancel: jest.fn(),
        })
      );

      const confirmButton = screen.getByRole('button', { name: /delete|remove/i });
      await user.click(confirmButton);

      expect(mockOnConfirm).toHaveBeenCalledWith('cred-1');
    });

    test('should call onCancel when cancel button clicked', async () => {
      const mockOnCancel = jest.fn();
      const user = userEvent.setup();
      const credential: Credential = {
        id: 'cred-1',
        url: 'https://example.com',
        username: 'user1',
        password: 'pass1',
      };

      render(
        React.createElement(DeleteCredentialDialog, {
          credential,
          onConfirm: jest.fn(),
          onCancel: mockOnCancel,
        })
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });

    test('should warn about irreversible action', () => {
      const credential: Credential = {
        id: 'cred-1',
        url: 'https://example.com',
        username: 'user1',
        password: 'pass1',
      };

      render(
        React.createElement(DeleteCredentialDialog, {
          credential,
          onConfirm: jest.fn(),
          onCancel: jest.fn(),
        })
      );

      expect(screen.getByText(/cannot.*undo|permanent|irreversible/i)).toBeInTheDocument();
    });
  });
});
