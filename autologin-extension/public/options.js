/**
 * AutoLogin Options Page Script
 * Handles credential import and account management
 */

/**
 * Show message to user
 */
function showMessage(text, type, duration = 4000) {
  const msgEl = document.getElementById('message');
  msgEl.textContent = text;
  msgEl.className = `message show ${type}`;
  if (duration > 0) {
    setTimeout(() => {
      msgEl.classList.remove('show');
    }, duration);
  }
}

/**
 * Detect if format is colon-delimited (URL:ID:PASS)
 */
function isColonDelimited(line) {
  const colonCount = (line.match(/:/g) || []).length;
  const commaCount = (line.match(/,/g) || []).length;
  return colonCount >= 2 && commaCount === 0;
}

/**
 * Parse colon-delimited format (URL:ID:PASS)
 */
function parseColonDelimited(text) {
  const lines = text.trim().split('\n');
  const credentials = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = [];
    let current = '';
    let urlComplete = false;

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (char === ':' && !urlComplete) {
        const beforeColon = current;
        if (beforeColon.endsWith('http') || beforeColon.endsWith('https')) {
          current += char;
        } else {
          parts.push(current);
          current = '';
          urlComplete = true;
        }
      } else if (char === ':' && urlComplete && parts.length === 1) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    if (parts.length === 3) {
      const [url, username, password] = parts.map(p => p.trim());
      if (url && username && password) {
        credentials.push({ url, username, password });
      }
    }
  }

  return credentials;
}

/**
 * Parse a CSV header line, handling quoted fields
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim().replace(/^"|"$/g, ''));
  return fields;
}

/**
 * Parse standard CSV format
 */
function parseCSV(text) {
  const lines = text.trim().split('\n');

  if (lines.length < 2) {
    throw new Error('CSV must have header + at least 1 row');
  }

  const headerFields = parseCSVLine(lines[0]);
  const headers = headerFields.map(h => h.toLowerCase());
  const urlIndex = headers.indexOf('url');
  const usernameIndex = headers.indexOf('username');
  const passwordIndex = headers.indexOf('password');

  if (urlIndex === -1 || usernameIndex === -1 || passwordIndex === -1) {
    console.error('Found headers:', headers);
    throw new Error('CSV must have columns: url, username, password');
  }

  const credentials = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);

    if (fields.length > Math.max(urlIndex, usernameIndex, passwordIndex)) {
      const url = fields[urlIndex]?.trim();
      const username = fields[usernameIndex]?.trim();
      const password = fields[passwordIndex]?.trim();

      if (url && username && password) {
        credentials.push({ url, username, password });
      }
    }
  }

  return credentials;
}

/**
 * Handle direct text input import
 */
async function handleDirectImport() {
  console.log('🔵 handleDirectImport called');
  const textarea = document.getElementById('credentialInput');
  const text = textarea.value.trim();

  console.log('📝 Text length:', text.length);
  if (!text) {
    console.log('❌ No text to import');
    showMessage('❌ Please paste credentials first', 'error');
    return;
  }

  const lines = text.split('\n').filter(l => l.trim());
  console.log('📋 Parsed lines:', lines.length);

  if (lines.length === 0) {
    console.log('❌ No lines parsed');
    showMessage('❌ No credentials to import', 'error');
    return;
  }

  console.log('✅ Direct import started with', lines.length, 'lines');
  showMessage('📖 Parsing credentials...', 'info', 0);

  try {
    let credentials = [];

    const firstLine = lines[0].trim();
    console.log('🔍 First line:', firstLine.substring(0, 100));
    const isColon = isColonDelimited(firstLine);
    console.log('📍 Format detected as:', isColon ? 'COLON-DELIMITED' : 'CSV');

    try {
      if (isColon) {
        console.log('🔄 Parsing colon-delimited format...');
        credentials = parseColonDelimited(text);
        console.log('✅ Parsed', credentials.length, 'credentials');
        if (credentials.length === 0) {
          throw new Error('Invalid colon-delimited format (expected: URL:USERNAME:PASSWORD)');
        }
      } else {
        console.log('🔄 Parsing CSV format...');
        credentials = parseCSV(text);
        console.log('✅ Parsed', credentials.length, 'credentials');
      }
    } catch (parseError) {
      console.error('❌ Parse error:', parseError.message);
      showMessage('❌ Parse error: ' + parseError.message, 'error');
      return;
    }

    if (credentials.length === 0) {
      showMessage('❌ No valid credentials found', 'error');
      return;
    }

    showMessage(`📝 Found ${credentials.length} credentials. Importing...`, 'info', 0);
    const progressBox = document.getElementById('progressBox');
    progressBox.style.display = 'block';

    let imported = 0;
    let failed = 0;
    const failedUrls = [];

    for (let i = 0; i < credentials.length; i++) {
      const cred = credentials[i];
      document.getElementById('progressText').textContent = `${i + 1}/${credentials.length}`;

      try {
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Message timeout'));
          }, 5000);

          // Normalize URL to include protocol if missing
          let normalizedUrl = cred.url;
          if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
            normalizedUrl = 'https://' + normalizedUrl;
          }

          chrome.runtime.sendMessage({
            type: 'ADD_CREDENTIAL',
            data: {
              url: normalizedUrl,
              username: cred.username,
              password: cred.password
            }
          }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });

        if (response?.success) {
          imported++;
          console.log(`✅ Imported: ${cred.url}`);
        } else {
          failed++;
          failedUrls.push(cred.url);
          console.error(`❌ Failed: ${cred.url}`, response?.error);
        }
      } catch (e) {
        failed++;
        failedUrls.push(cred.url);
        console.error(`❌ Error importing ${cred.url}:`, e);
      }
    }

    progressBox.style.display = 'none';

    if (imported > 0) {
      textarea.value = '';
      const msg = `✅ Imported ${imported} account${imported !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed: ${failedUrls.join(', ')})` : ''}`;
      showMessage(msg, 'success');
    } else {
      const msg = `❌ Failed to import any credentials`;
      showMessage(msg, 'error');
    }

  } catch (error) {
    showMessage('❌ Error: ' + error.message, 'error');
    console.error('Import error:', error);
  }
}

/**
 * Confirm clear all data
 */
function confirmClearData() {
  if (!confirm('Clear ALL extension data? This cannot be undone.')) {
    return;
  }

  clearAllData();
}

/**
 * Clear all data
 */
async function clearAllData() {
  showMessage('🗑️ Clearing all data...', 'info', 0);

  try {
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, 5000);

      chrome.runtime.sendMessage({ type: 'DEV_CLEAR_DATA' }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (response?.success) {
      showMessage('✅ All data cleared successfully', 'success');
    } else {
      showMessage('❌ Failed to clear data: ' + response?.error, 'error');
    }
  } catch (error) {
    showMessage('❌ Error: ' + error.message, 'error');
    console.error('Clear data error:', error);
  }
}

/**
 * Load and display saved API key status
 */
function loadApiKey() {
  chrome.storage.local.get('openrouter_api_key', (result) => {
    const key = result['openrouter_api_key'] || '';
    const input = document.getElementById('apiKeyInput');
    const status = document.getElementById('apiKeyStatus');
    if (key) {
      input.value = key;
      status.textContent = '✅ API key saved';
      status.style.color = '#155724';
    } else {
      status.textContent = '⚠️ No API key set — AI page analysis disabled';
      status.style.color = '#856404';
    }
  });
}

/**
 * Save API key to storage
 */
function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  const status = document.getElementById('apiKeyStatus');
  if (!key) {
    status.textContent = '❌ Please enter a key';
    status.style.color = '#721c24';
    return;
  }
  chrome.storage.local.set({ openrouter_api_key: key }, () => {
    status.textContent = '✅ API key saved';
    status.style.color = '#155724';
  });
}

/**
 * Initialize event listeners
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 Initializing event listeners...');

  const importBtn = document.getElementById('importBtn');
  const clearBtn = document.getElementById('clearBtn');
  const clearDataBtn = document.getElementById('clearDataBtn');
  const backLink = document.getElementById('backLink');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  const toggleApiKey = document.getElementById('toggleApiKey');
  const apiKeyInput = document.getElementById('apiKeyInput');

  // Load saved API key on open
  loadApiKey();

  if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener('click', saveApiKey);
  }

  if (toggleApiKey && apiKeyInput) {
    toggleApiKey.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      toggleApiKey.textContent = isPassword ? 'Hide' : 'Show';
    });
  }

  if (importBtn) {
    importBtn.addEventListener('click', () => {
      console.log('📌 Import button clicked');
      handleDirectImport();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      console.log('📌 Clear button clicked');
      document.getElementById('credentialInput').value = '';
    });
  }

  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', () => {
      console.log('📌 Clear data button clicked');
      confirmClearData();
    });
  }

  if (backLink) {
    backLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'chrome-extension://' + chrome.runtime.id + '/popup.html';
    });
  }
});

console.log('✅ AutoLogin Options script loaded');
