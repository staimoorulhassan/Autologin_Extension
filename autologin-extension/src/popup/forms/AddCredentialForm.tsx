/**
 * Task 5: AddCredentialForm Component
 * Modal form for adding new credentials
 */

import { useState } from 'react';
import type { Credential } from '../../types';

interface AddCredentialFormProps {
  onSubmit: (credential: Omit<Credential, 'id' | 'created_at'>) => Promise<void>;
  onCancel: () => void;
}

interface FormErrors {
  url?: string;
  username?: string;
  password?: string;
}

/**
 * Form component for adding new credentials
 */
export function AddCredentialForm({ onSubmit, onCancel }: AddCredentialFormProps) {
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validateForm(): FormErrors {
    const newErrors: FormErrors = {};

    if (!url.trim()) {
      newErrors.url = 'URL is required';
    } else {
      try {
        new URL(url);
      } catch {
        newErrors.url = 'Invalid URL format';
      }
    }

    if (!username.trim()) {
      newErrors.username = 'Username is required';
    }

    if (!password.trim()) {
      newErrors.password = 'Password is required';
    }

    return newErrors;
  }

  function clearError(field: keyof FormErrors) {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        url,
        username,
        password,
      });
    } catch (error) {
      setErrors({ password: error instanceof Error ? error.message : 'Failed to add credential' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="credential-form">
      <h2>Add New Account</h2>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="url">URL</label>
          <input
            id="url"
            type="text"
            placeholder="https://example.com"
            value={url}
            onChange={e => {
              setUrl(e.target.value);
              clearError('url');
            }}
            disabled={isSubmitting}
          />
          {errors.url && <span className="error">{errors.url}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            placeholder="your username"
            value={username}
            onChange={e => {
              setUsername(e.target.value);
              clearError('username');
            }}
            disabled={isSubmitting}
          />
          {errors.username && <span className="error">{errors.username}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="your password"
            value={password}
            onChange={e => {
              setPassword(e.target.value);
              clearError('password');
            }}
            disabled={isSubmitting}
          />
          {errors.password && <span className="error">{errors.password}</span>}
        </div>

        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Adding...' : 'Add Account'}
          </button>
        </div>
      </form>
    </div>
  );
}
