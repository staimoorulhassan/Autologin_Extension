/**
 * Task 5: DeleteCredentialDialog Component
 * Confirmation dialog for deleting credentials
 */

import type { Credential } from '../../types';

interface DeleteCredentialDialogProps {
  credential: Credential;
  onConfirm: (id: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Dialog component for confirming credential deletion
 */
export function DeleteCredentialDialog({ credential, onConfirm, onCancel }: DeleteCredentialDialogProps) {
  async function handleConfirm() {
    await onConfirm(credential.id!);
  }

  return (
    <div className="delete-dialog">
      <h2>Delete Account</h2>

      <div className="dialog-content">
        <p>Are you sure you want to delete the account for <strong>{credential.url}</strong>?</p>
        <p className="warning">This action cannot be undone and is permanent.</p>
      </div>

      <div className="dialog-actions">
        <button type="button" onClick={onCancel} className="cancel-button">
          Cancel
        </button>
        <button type="button" onClick={handleConfirm} className="delete-button">
          Delete
        </button>
      </div>
    </div>
  );
}
