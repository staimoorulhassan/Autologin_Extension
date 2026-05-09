/**
 * Task 4: AccountList Component
 * Displays list of stored accounts with login buttons
 */

import { useState, useMemo } from 'react';
import type { Credential } from '../../types';

interface AccountListProps {
  credentials: Credential[];
  onLogin: (accountId: string) => void | Promise<void>;
}

/**
 * Component that displays account list with search and login controls
 */
export function AccountList({ credentials, onLogin }: AccountListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter credentials based on search term
  const filteredCredentials = useMemo(() => {
    if (!searchTerm.trim()) {
      return credentials;
    }

    const lowerSearch = searchTerm.toLowerCase();
    return credentials.filter(
      cred =>
        cred.url.toLowerCase().includes(lowerSearch) ||
        cred.username.toLowerCase().includes(lowerSearch)
    );
  }, [credentials, searchTerm]);

  if (credentials.length === 0) {
    return (
      <div className="account-list-empty">
        <p>No accounts saved yet</p>
      </div>
    );
  }

  return (
    <div className="account-list">
      <div className="account-list-header">
        <h2>{credentials.length} Account{credentials.length === 1 ? '' : 's'}</h2>
        <input
          type="text"
          placeholder="Search accounts..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="account-list-container">
        {filteredCredentials.length === 0 ? (
          <div className="no-results">No accounts match your search</div>
        ) : (
          <ul className="account-items">
            {filteredCredentials.map(credential => (
              <li key={credential.id} className="account-item">
                <div className="account-info">
                  <div className="account-url">{credential.url}</div>
                  <div className="account-username">{credential.username}</div>
                </div>
                <button
                  onClick={() => onLogin(credential.id!)}
                  className="login-button"
                  aria-label={`Login to ${credential.url}`}
                >
                  Login
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
