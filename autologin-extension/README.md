# AutoLogin — AI-Orchestrated Bulk Login Extension

**AutoLogin** is a Chrome and Firefox browser extension that logs into multiple websites automatically. Give it a list of accounts, press one button, and it handles everything — opening each site, visually analyzing the login form via AI, filling credentials, handling Cloudflare verification and CAPTCHAs, capturing cookies, and moving on to the next account.

Built for serious use: TypeScript strict mode, per-password encryption, a typed message bus, MV3 service worker resilience, and an AI vision loop that sees the page the same way a human does.

---

## What Makes This Different

Most bulk login tools require you to write CSS selectors for every site: *"the email field is `#login-email` on this site."* AutoLogin replaces that with a vision loop:

1. Take a screenshot of the current tab
2. Ask an AI: *"what do you see, and what is the single next action?"*
3. Execute that one action (type into a field, click a button, wait for a redirect)
4. Repeat from step 1 until success or failure

The AI reads the page visually — it works on sites it has never seen before, handles layouts that change, deals with multi-step flows (email → Next → password → Submit), and self-corrects when an action does not take effect.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  popup.js  (React 18)                                           │
│  Live AI feed · Batch controls · Escalation UI · Export         │
└───────────────────────┬─────────────────────────────────────────┘
                        │  chrome.runtime.sendMessage (typed)
┌───────────────────────▼─────────────────────────────────────────┐
│  background.js  (MV3 Service Worker)                            │
│                                                                 │
│  Single `batch_tick` alarm drives the entire state machine.     │
│  State is stored in chrome.storage.local so the worker         │
│  survives the MV3 30-second idle kill and resumes cleanly.      │
│                                                                 │
│  Per-account flow:                                              │
│    startNextAccount() → open tab (active) → save state →       │
│    [alarm tick] → executeOrchestrationStep() loop:             │
│      screenshot → decideNextAction() → EXECUTE_DOM_ACTION →    │
│      save step → reschedule tick → repeat                      │
│                                                                 │
│  Owns all IndexedDB writes via Dexie (credentials, cookies,    │
│  logs). Popup and content script never touch the DB directly.  │
└───────────────────────┬─────────────────────────────────────────┘
                        │  chrome.tabs.sendMessage
┌───────────────────────▼─────────────────────────────────────────┐
│  content.js  (injected at document_start on all URLs)           │
│  EXECUTE_DOM_ACTION · form detection · logout · screenshots     │
└─────────────────────────────────────────────────────────────────┘
```

### Source Layout

```
src/
├── background/worker.ts        Alarm-driven state machine + all message handlers
├── content/contentMain.ts      DOM interaction: type, click, detect, screenshot
├── popup/popup.tsx             React UI: live AI feed, batch controls, export
├── automation/
│   ├── ai-agent.ts             Vision API calls + decideNextAction() orchestrator
│   ├── engine.ts               DOM-based form detection fallback
│   ├── captcha.ts              CAPTCHA detection
│   └── anti-detection.ts       Human-like timing and event sequencing
├── store/database.ts           Dexie/IndexedDB schema + CRUD
├── crypto/encryption.ts        TweetNaCl XSalsa20-Poly1305 + key derivation
├── messaging/
│   ├── types.ts                Discriminated union message types + response map
│   ├── handlers.ts             Handler registry
│   └── messenger.ts            Promise-wrapped sendMessage with timeout
└── types/index.ts              Shared interfaces
```

---

## Feature Overview

### AI Orchestration Loop
- **Per-action vision loop** — one screenshot → one AI decision → one DOM action → repeat
- **Step history** — AI receives the last 5 actions in context so it can reason about what has already been tried
- **Template learning** — after the first successful login on a hostname, the selector sequence is saved; subsequent accounts on the same site use the template as a hint, reducing AI calls needed
- **Escalation** — after 3 consecutive failures on the same hostname, the batch pauses and asks for a plain-English instruction (e.g. "click Accept Cookies first"). The AI incorporates it and retries
- **Live feed** — every AI action streams into the popup in real time with action type, account, and commentary

### Service Worker Resilience (MV3)
MV3 service workers are killed after 30 seconds of inactivity. The extension survives this:
- All batch state lives in `chrome.storage.local`, not in-memory
- A `batch_tick` alarm is scheduled **before** every long wait (page load, DOM action). If the worker dies during the wait, the alarm fires later, the worker restarts, reads state, takes a fresh screenshot, and continues
- The AI re-evaluates from the current visual page state on restart — no stale assumptions

### Form Filling
- Primary: `document.execCommand('insertText')` — fires the browser-native edit chain that React, Vue, and Angular all intercept to update their internal state
- Fallback: native `HTMLInputElement.prototype.value` setter + `InputEvent` for non-framework pages
- Fills are verified: a warning is logged if the field reads back a different value than what was written

### CAPTCHA Handling

| Type | Action |
|---|---|
| Cloudflare Turnstile (auto-solve) | AI waits for the widget to complete, then continues |
| reCAPTCHA v2 checkbox | AI clicks the checkbox |
| reCAPTCHA v3 (invisible) | No action needed |
| Text / math CAPTCHA | AI reads the screenshot and types the answer |
| Image grid / hCaptcha | Batch pauses — solve in the tab, click Continue in popup |

### Batch Controls
- **Start All** — groups credentials by hostname so all accounts for the same site run together and share templates, then processes in sequence
- **Stop** — halts after the current account finishes
- **Continue** — resumes after a CAPTCHA pause
- **Export Results** — downloads a JSON file with successful logins and their captured cookies (explicit user action, not auto-saved to disk)

---

## Security Considerations

This section documents exactly what is stored, where, and in what form.

### What Is Encrypted

**Credential passwords** are encrypted before being written to IndexedDB using **XSalsa20-Poly1305** (TweetNaCl `secretbox`) — the same algorithm used by Signal. This is authenticated encryption: both confidentiality and tamper-detection.

- 256-bit key derived from a browser-session-specific value via 1000-round NaCl hashing
- Format: 24-byte random nonce prepended to ciphertext, hex-encoded
- Stored in the `password_encrypted` column of the `credentials` IndexedDB table
- A copy of the IndexedDB file without the key is unreadable

### What Is NOT Encrypted at Application Level

**Cookie values** captured after successful logins are stored as plaintext objects in the `cookies` IndexedDB table. They are protected by OS-level browser profile isolation (only your browser process can read them) but are not additionally encrypted by this extension.

**`chrome.storage.local`** holds plaintext JSON for:

| Key | Contents | Contains credentials? |
|---|---|---|
| `orchestratorState` | Batch progress, current index, hostname templates, step history | No |
| `ai_feed` | AI commentary strings for the live popup feed | No |
| `successLog` | Metadata: hostname, username, timestamp, cookie count | Username only — no password |

No passwords are written to `chrome.storage.local`.

### No Auto-Download of Plaintext Files

Earlier versions of this extension auto-saved a `.txt` file to the Downloads folder containing credentials and cookies in plaintext. **This has been removed.** The Downloads folder is accessible to any process running as your OS user and is not an appropriate location for credential data.

The replacement: cookies are stored in IndexedDB. The **Export Results** button in the popup generates a JSON export on explicit user request. That export includes cookie values (plaintext) — treat the file accordingly and store it somewhere appropriate.

### What the AI Receives

- The AI receives **screenshots** of login pages — visual images of what is visible in the browser tab
- Screenshots contain page layout, form labels, and button text
- Screenshots do **not** contain typed passwords (passwords are filled locally after the AI responds)
- API keys are stored in `chrome.storage.local` on your device and transmitted only to the configured AI provider

### Data Flow Summary

```
Your password
  → encrypted (XSalsa20-Poly1305)
  → stored in IndexedDB credentials table
  → decrypted in-memory only when the batch processes that account
  → typed into the login form via EXECUTE_DOM_ACTION in content script
  → never written to any file or sent to any external server

Cookies captured after login
  → stored in IndexedDB cookies table (plaintext, OS-profile-protected)
  → exported via popup "Export Results" button → JSON file, user-triggered

Screenshots taken during the AI loop
  → captured in-memory by captureVisibleTab / browser.tabs.captureTab
  → sent to AI provider API
  → discarded after the AI responds
  → never written to disk by this extension
```

### Threat Model

| Scenario | Risk |
|---|---|
| Someone reads your IndexedDB file without your browser session | Passwords encrypted; cookies exposed |
| Someone with your OS account opens your browser | Same as any browser password manager |
| Malware with full OS access | Do not use credential tools in this scenario |
| Network interception of AI API calls | Only screenshots transmitted; no credentials |
| AI provider retains your screenshots | Review your provider's data retention policy |

### Legal Notice

This extension is intended for automating access to accounts you own or have explicit authorization to access. Unauthorized access to computer systems is illegal in most jurisdictions. Bulk automated login may violate the terms of service of some websites. You are responsible for compliance with applicable laws and service agreements. The authors accept no liability for misuse.

---

## AI Providers

The AI key is **optional** — the extension works without it using DOM-based form detection. With a key configured, the vision loop handles sites DOM detection cannot.

Keys are configured in **Options → AI Settings** and stored only in `chrome.storage.local` on your device.

### Free Options

**Pollinations AI** (`gen.pollinations.ai`) — primary provider, OpenAI-compatible endpoint. Works without an API key for text models; vision requires a Pollinations account.

**OpenRouter** (`openrouter.ai/keys`) — routes to many models. Several have completely free tiers:

| Model | Role |
|---|---|
| `qwen/qwen2.5-vl-72b-instruct:free` | Primary — best free vision model |
| `meta-llama/llama-3.2-90b-vision-instruct:free` | Secondary |
| `google/gemini-2.0-flash-exp:free` | Tertiary |
| `google/gemma-3-27b-it:free` | Last resort |

The extension tries Pollinations first, then falls back through OpenRouter models automatically.

### Paid Options

| Provider | Model | Estimated Cost | Notes |
|---|---|---|---|
| OpenAI | `gpt-4o-mini` | ~$0.01 / 1K logins | Best reliability |
| Anthropic | `claude-haiku-4-5` | ~$0.01 / 1K logins | Best instruction-following |
| Google Gemini | `gemini-2.0-flash` | Free tier generous | AI Studio key |
| Qwen VL | `qwen-vl-max` | Low | Strong OCR |
| DeepSeek | `deepseek-vl2` | Very low | OpenAI-compatible |

---

## Setup

### 1. Build

```bash
git clone https://github.com/staimoorulhassan/Autologin_Extension
cd Autologin_Extension/autologin-extension
npm install
npm run build
```

### 2. Load in Browser

**Chrome / Edge:**
1. `chrome://extensions` → Enable **Developer Mode**
2. **Load unpacked** → select the `dist/` folder

**Firefox:**
1. `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on** → select `dist/manifest.json`

For persistent Firefox loading: `npm run web-ext:run`

### 3. Configure AI Key (Optional)

1. Get a free key at [openrouter.ai/keys](https://openrouter.ai/keys)
2. Extension icon → **Options** → **AI Settings** → paste key → **Save**

### 4. Import Credentials

In Options, paste CSV or colon-delimited format:

```csv
url,username,password
https://github.com,user@email.com,mypassword
https://reddit.com,myusername,pass456
```

```
https://github.com:user@email.com:mypassword
https://reddit.com:myusername:pass456
```

### 5. Run

Extension icon → **Developer** tab → **▶ Start All**

Watch the Live AI Feed for real-time action commentary. When the batch finishes (or at any point), click **⬇ Export Results (JSON)** to download all captured cookies as a JSON file.

---

## Development

```bash
npm run dev           # Webpack watch mode — rebuilds dist/ on save
npm run build         # Production build
npm run type-check    # TypeScript strict check — must stay at 0 errors
npm run lint          # ESLint
npm test              # Full Jest suite
npm run web-ext:run   # Launch Firefox with dist/ loaded, auto-reload on change
```

**Stack:** TypeScript 5 strict · React 18 · Webpack 5 · Dexie.js · TweetNaCl · Jest + ts-jest · Chrome/Firefox MV3

---

## Status Codes

| Code | Meaning |
|---|---|
| `SUCCESS` | Logged in, cookies captured |
| `WRONG_PASSWORD` | Form submitted but login rejected |
| `CAPTCHA_TIMEOUT` | CAPTCHA not solved in time |
| `FORM_NOT_FOUND` | No login form found within max steps |
| `IN_PROGRESS` | Currently being processed |

---

## License

MIT — free to use, modify, and distribute. See Security Considerations above before deploying in any environment where the threat model matters.
