# AutoLogin Extension

A Chrome/Firefox browser extension that automates bulk login across multiple websites using **AI vision** — it screenshots each page, asks an AI to identify the form fields, fills them in human-like, and submits. No selector config, no fragile CSS rules. Just works.

---

## How It Works

```
Add credentials → Start Batch → Extension opens each site in a background tab
                                              ↓
                                    Screenshot captured
                                              ↓
                                    AI identifies: email field? password? submit?
                                              ↓
                                    Fields filled character-by-character (human-like)
                                              ↓
                                    Form submitted → cookies saved to file
```

Multi-step flows (Google's email → Next → password → Sign in) are handled automatically — the AI re-analyzes the page after each step, up to 6 steps deep.

---

## Features

| Feature | Details |
|---|---|
| **AI Vision** | Screenshot → free OpenRouter vision models identify CSS selectors per step |
| **Multi-step flows** | Handles email-first flows (Google, Microsoft, Yahoo, etc.) |
| **CAPTCHA handling** | Checkbox reCAPTCHA auto-clicked; image challenges pause for human |
| **Human-like typing** | Random delays + character-by-character input, bypasses React controlled inputs |
| **Encrypted storage** | XSalsa20-Poly1305 (TweetNaCl) in IndexedDB — credentials never stored in plaintext |
| **Cookie capture** | Session cookies saved to a text file after each successful login |
| **Batch processing** | Queue hundreds of accounts; pause/resume at any time |
| **Zero cost AI** | Uses free-tier OpenRouter models — no API bill for typical usage |

---

## CAPTCHA Support

| Type | Status |
|---|---|
| reCAPTCHA v2 checkbox ("I'm not a robot") | ✅ Auto-clicked |
| Text / math CAPTCHA | ✅ AI reads screenshot and types answer |
| reCAPTCHA v3 (invisible, score-based) | ✅ No action needed |
| reCAPTCHA v2 image grid ("select all traffic lights") | ⏸️ Pauses — human solves, then Resume |
| hCaptcha image challenge | ⏸️ Pauses — human solves, then Resume |

When paused, the tab stays open. Solve it manually, then click **Resume** in the popup.

---

## Setup

### 1. Build

```bash
git clone https://github.com/staimoorulhassan/Autologin_Extension
cd Autologin_Extension/autologin-extension
npm install
npm run build
```

Load the `dist/` folder as an unpacked extension in `chrome://extensions` (enable Developer Mode first).

### 2. Configure AI (required)

1. Get a **free** API key at [openrouter.ai/keys](https://openrouter.ai/keys) — no credit card needed for free models
2. Click the extension icon → **Options** → paste key in **AI Settings** → Save

The extension uses only free OpenRouter models (`baidu/qianfan-ocr-fast:free`, `google/gemma-4-31b-it:free`). Zero cost for typical usage volumes.

> The API key is stored in `chrome.storage.local` on your own device. It is never committed to source code and never sent anywhere except directly to OpenRouter.

### 3. Import credentials

Open Options → paste in either format:

**CSV:**
```
url,username,password
https://github.com,user@email.com,mypassword
https://reddit.com,myusername,anotherpass
```

**Colon-delimited:**
```
https://github.com:user@email.com:mypassword
https://reddit.com:myusername:anotherpass
```

### 4. Run

Click the extension icon → **Developer** tab → **Start Batch Login**.

Watch it go through each account. Green = success with cookies saved. Orange = CAPTCHA pause needed. Red = wrong password or blocked.

---

## Security

**Read before using.**

### What is encrypted

Credentials are encrypted before being written to IndexedDB using **XSalsa20-Poly1305** authenticated encryption via [TweetNaCl.js](https://tweetnacl.js.org/) — the same primitive used by Signal for message encryption. The ciphertext is stored as `password_encrypted`; plaintext is never persisted to disk.

### What is NOT protected

- The encryption key is tied to your browser profile, not a separate master password. Anyone with access to your OS user account + browser profile can decrypt credentials.
- Login page screenshots are sent to OpenRouter for AI analysis. These contain visual page content, **not** your credentials — fields are filled *after* the AI responds.
- The extension requires `<all_urls>` host permission to inject the content script on any login page. Review `manifest.json` before installing.

### Threat model

This tool is built for **automating accounts you own** on machines you control. It is not designed to be secure against:

- Malicious browser extensions with equivalent permissions
- OS-level access to your browser profile directory
- A compromised or shared browser environment

### ⚠️ Disclaimer

> Credentials are stored locally and encrypted, but no local storage is unconditionally secure. Use at your own risk. The authors take no responsibility for credential exposure, account lockouts, or violations of any website's terms of service. **Only use this on accounts you own.** Bulk automated logins may trigger rate limits, security alerts, or temporary bans depending on the target service.

---

## Architecture

```
src/
├── background/worker.ts      # Service worker — orchestrates batch, owns all DB writes
├── content/contentMain.ts    # Injected into pages — fills forms, detects CAPTCHAs
├── popup/popup.tsx           # React 18 UI — credentials, batch controls, live logs
├── automation/
│   ├── ai-agent.ts           # OpenRouter vision API — page analysis + CAPTCHA solving
│   └── engine.ts             # DOM-heuristic form detection (fallback when AI unavailable)
├── store/database.ts         # Dexie/IndexedDB — credentials, cookies, logs, screenshots
├── crypto/encryption.ts      # TweetNaCl XSalsa20-Poly1305 encrypt/decrypt + key derivation
├── messaging/                # Typed Chrome message bus (popup ↔ background ↔ content)
└── types/index.ts            # Shared TypeScript interfaces
```

The three components communicate exclusively via `chrome.runtime.sendMessage` with a typed discriminated-union message system. All IndexedDB writes go through the background service worker — content scripts and the popup never touch the database directly. Deleting a credential cascades to its cookies, logs, and screenshots.

---

## Development

```bash
npm run dev           # webpack watch mode — rebuilds dist/ on save
npm run build         # production build
npm test              # 389 tests (Jest + ts-jest)
npm run type-check    # TypeScript strict mode — 0 errors
npm run lint          # ESLint over src/**/*.ts{,x}
```

---

## Tech Stack

- **TypeScript** strict mode — `noImplicitAny`, `strictNullChecks`, full coverage
- **React 18** — popup UI
- **Webpack 5** — MV3-compatible bundling with three entry points
- **Dexie.js** — typed IndexedDB wrapper
- **TweetNaCl** — XSalsa20-Poly1305 authenticated encryption
- **OpenRouter** — free-tier vision AI (`baidu/qianfan-ocr-fast:free` primary)
- Chrome/Firefox **MV3** WebExtension API

---

## License

MIT. Read the security section above before using in any sensitive environment.
