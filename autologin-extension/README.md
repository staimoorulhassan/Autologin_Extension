# AutoLogin — Bulk Login Automation Extension

**AutoLogin** is a Chrome and Firefox browser extension that logs into multiple websites automatically. You give it a list of accounts, press one button, and it handles everything — opening each site, finding the login form, typing your credentials, dealing with CAPTCHAs, and saving the session cookies. No manual work. No per-site configuration.

Built with real engineering: TypeScript, encrypted local storage, a typed message bus, and an AI vision system that reads login pages the same way a human would — by looking at them.

---

## What It Does

Most bulk login tools require you to write custom selectors for every website — essentially telling the tool "the email field is called `#login-email` on this site." AutoLogin skips that entirely. Instead it takes a screenshot of the current page and asks an AI: *"what step is this, and what are the field selectors?"* The AI reads the page visually, returns CSS selectors, and the extension fills them in.

This means it works on sites it has never seen before, handles sites that change their layout, and deals with multi-step flows (like Google's email → Next → password → Sign in) without any configuration.

---

## Feature Overview

### Core Automation
- **Batch login** — queue hundreds of accounts and process them one by one
- **Multi-step flow support** — handles email-first flows (Google, Microsoft, Yahoo, LinkedIn, and most modern login pages)
- **Up to 6 login steps per account** — enough for email → CAPTCHA → password → 2FA flows
- **Pause and resume** — stop the batch at any time and pick up where you left off
- **Configurable delay** between accounts (set in Developer tab)
- **Cookie capture** — after each successful login, all session cookies are saved to a text file via `chrome.downloads`
- **Per-account login history** — every attempt is logged with status, timestamp, and error detail

### AI Vision System
- Takes a live screenshot of the current tab using `chrome.tabs.captureVisibleTab`
- Sends the screenshot to an AI vision model with a structured prompt
- AI identifies: what login step is showing, CSS selectors for each field, whether a CAPTCHA is present
- Falls back to DOM-based detection if AI is not configured or unavailable
- Supports multiple AI providers (see AI Providers section below)

### Form Detection & Filling
- **AI-powered**: vision model reads the page like a human and returns exact selectors
- **DOM fallback**: queries `input[type="email"]`, `input[type="password"]`, `button[type="submit"]` and related patterns; filters to visible elements only; handles React/Angular controlled inputs via native input setter
- **Visibility filtering** — hidden or off-screen fields are skipped
- **Multi-strategy button detection** — checks `type="submit"`, text content (`next`, `sign in`, `continue`), `aria-label`, `title`, and `data-testid` attributes
- **React/Angular compatibility** — uses `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` to trigger framework state updates properly

### Human-Like Behavior
- Fields are filled with random per-character delays
- Mouse events (focus, input, change, keyup) fired in correct sequence
- Tab open in background (not active) — less suspicious to bot detection
- Cookies cleared between accounts to prevent session bleed

### CAPTCHA Handling

| CAPTCHA Type | What Happens |
|---|---|
| reCAPTCHA v2 checkbox ("I'm not a robot") | Clicked automatically |
| reCAPTCHA v3 (invisible, score-based) | No action needed — extension behaves normally |
| Text CAPTCHA (distorted letters/words) | AI reads screenshot and types the answer |
| Math CAPTCHA (e.g. "3 + 5 = ?") | AI solves and types the answer |
| reCAPTCHA v2 image grid ("select traffic lights") | **Paused** — tab stays open for you to solve manually, then Resume |
| hCaptcha image challenge | **Paused** — same as above |

After 2 failed CAPTCHA attempts on the same page, the extension pauses automatically rather than looping into account lockout.

### Storage & Exports
- Credentials stored in **IndexedDB** (Dexie.js) — encrypted at rest
- Cookies stored per-account with expiry metadata
- Logs stored per-account with full status history
- **Export logs** as CSV or JSON
- **Success file** saved to your Downloads folder: one `.txt` file per domain with credentials + all cookies captured at login time
- **Cleanup** — retention policy removes old logs and cookies automatically

---

## Developer Mode

The extension has a **Developer tab** in the popup specifically built for power users running large batches. This is where most of the control lives.

### Available Controls

| Control | What It Does |
|---|---|
| **Start Batch Login** | Begins processing all saved credentials in sequence |
| **Stop Batch** | Halts immediately after the current account finishes |
| **Resume Batch** | Continues after a CAPTCHA pause or manual stop |
| **Login Delay (seconds)** | Time to wait between accounts — increase if getting rate-limited |
| **Live Progress** | Shows `current / total`, current account URL, and batch status |
| **Dev Logs** | Real-time log feed showing every step: form detected, fields filled, submit clicked, result |
| **Clear All Data** | Wipes all credentials, logs, cookies from local storage |

### Status Codes You Will See

| Status | Meaning |
|---|---|
| `SUCCESS` | Logged in, cookies saved |
| `WRONG_PASSWORD` | Form submitted but login rejected |
| `CAPTCHA_PAUSED` | Waiting for human CAPTCHA solve |
| `CAPTCHA_TIMEOUT` | CAPTCHA not solved in time |
| `FORM_NOT_FOUND` | Neither AI nor DOM detection found a login form |
| `FORM_FILL_FAILED` | Found fields but could not fill them |
| `FORM_SUBMIT_FAILED` | Filled form but submit button not found or not clickable |
| `NETWORK_ERROR` | Tab failed to load or URL invalid |
| `BLOCKED_BY_BOT_DETECTION` | Cloudflare or similar challenge detected |
| `IN_PROGRESS` | Currently processing |

### Why Some Sites Are Hard Without AI

Without AI vision, the DOM fallback works well on straightforward sites — standard HTML forms with `input[type="email"]` and `input[type="password"]`. It struggles with:

- **Single-page apps** where fields are rendered dynamically after page load
- **Custom web components** that use shadow DOM and don't expose standard input types
- **Sites with unusual field names** or attributes
- **Multi-step flows** where the extension doesn't know whether it's on the email step or password step
- **Sites that deliberately obscure their field selectors** to prevent automation

With an AI key configured, all of these are handled automatically because the AI is reading the actual rendered page — not trying to guess selector patterns.

We have built in every DOM tweak we reasonably could: visibility filtering, fallback selector chains, button text matching, aria-label checking, React native setter, focus/blur sequencing. But there is a hard limit to what pattern-matching can do on a page it has never been trained on. The AI removes that limit.

---

## AI Providers

The AI key is **optional**. The extension runs without it using DOM detection. If you want AI-powered field detection (recommended for best reliability), you can use any of the providers below.

The key is stored in `chrome.storage.local` on your device only. It is configured in **Options → AI Settings** and never touches source code.

---

### Free Options (No Credit Card Required)

#### OpenRouter — Recommended Free Option
**Site:** [openrouter.ai/keys](https://openrouter.ai/keys)

OpenRouter is a unified API that routes to many different models. Several are completely free with no billing setup required. The extension uses these by default:

| Model | Why Used |
|---|---|
| `baidu/qianfan-ocr-fast:free` | Primary — fast, reliable, good at structured text extraction from images |
| `google/gemma-4-31b-it:free` | Secondary — higher quality when not rate-limited |
| `google/gemma-4-26b-a4b-it:free` | Tertiary fallback |
| `nvidia/nemotron-nano-12b-v2-vl:free` | Last resort |

The extension tries them in order and uses the first one that responds. Cost for typical batch usage: **zero**.

```
Provider: OpenRouter
Key format: sk-or-v1-...
Set in: Options → AI Settings
```

#### Pollinations AI — Completely Free, No Key Needed
**Site:** [pollinations.ai](https://pollinations.ai)

Pollinations runs a free public API with no authentication. The catch: their free anonymous endpoint currently only exposes text models without vision capability. Their paid `gen.pollinations.ai` endpoint has vision models (OpenAI, Gemini, Claude) but requires credits.

**Current status:** Pollinations free tier does not support vision. If they add a free vision model to `text.pollinations.ai` in the future, it will be the best zero-config option.

---

### Paid Options (Best Quality)

#### OpenAI
**Site:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

GPT-4o and GPT-4o-mini both have vision capability. GPT-4o-mini is cheap enough that analyzing thousands of login pages costs cents.

```
Base URL: https://api.openai.com/v1
Model: gpt-4o-mini  (cheapest with vision)
Model: gpt-4o       (highest accuracy)
Key format: sk-...
Estimated cost: ~$0.01 per 1,000 logins
```

To use OpenAI: configure the base URL and model in the extension source (`src/automation/ai-agent.ts`) and put your key in Options → AI Settings.

#### Anthropic (Claude)
**Site:** [console.anthropic.com](https://console.anthropic.com)

Claude has strong instruction-following and returns clean JSON reliably. Claude 3 Haiku is fast and inexpensive.

```
Base URL: https://api.anthropic.com/v1
Model: claude-haiku-4-5  (fast, cheap)
Model: claude-sonnet-4-6 (best accuracy)
Key format: sk-ant-...
Note: Requires x-api-key header instead of Bearer token
```

#### Google Gemini
**Site:** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

Gemini 2.0 Flash is free up to generous rate limits on Google AI Studio. Gemini 1.5 Pro has the largest context window of any model listed here.

```
Base URL: https://generativelanguage.googleapis.com/v1beta/openai
Model: gemini-2.0-flash   (free tier available)
Model: gemini-1.5-pro     (highest quality)
Key format: AIza...
```

#### Qwen (Alibaba Cloud)
**Site:** [dashscope.aliyuncs.com](https://dashscope.aliyuncs.com)

Qwen VL (Vision Language) models are strong at OCR and structured page analysis. Qwen-VL-Max has competitive accuracy with GPT-4o on visual tasks.

```
Base URL: https://dashscope.aliyuncs.com/compatible-mode/v1
Model: qwen-vl-max
Model: qwen-vl-plus  (cheaper)
Key format: sk-...
```

#### DeepSeek
**Site:** [platform.deepseek.com](https://platform.deepseek.com)

DeepSeek-VL2 is a capable open-source vision model available via API at very low cost. Good option if you want OpenAI-compatible API calls with lower billing.

```
Base URL: https://api.deepseek.com/v1
Model: deepseek-vl2
Key format: sk-...
Estimated cost: significantly lower than OpenAI
```

---

### Summary Table

| Provider | Cost | Vision | Key Required | Best For |
|---|---|---|---|---|
| OpenRouter (free models) | Free | ✅ | Yes (free) | Default recommendation |
| Pollinations AI | Free | ❌ (currently) | No | Future option if vision added |
| Google Gemini (AI Studio) | Free tier | ✅ | Yes (free) | High quality free option |
| OpenAI GPT-4o-mini | ~$0.01/1K logins | ✅ | Yes (paid) | Best reliability |
| Anthropic Claude Haiku | ~$0.01/1K logins | ✅ | Yes (paid) | Best instruction following |
| Qwen VL | Low cost | ✅ | Yes (paid) | Strong OCR accuracy |
| DeepSeek VL2 | Very low cost | ✅ | Yes (paid) | Budget paid option |
| None (DOM only) | Free | N/A | No | Simple sites only |

---

## Setup

### 1. Build from Source

```bash
git clone https://github.com/staimoorulhassan/Autologin_Extension
cd Autologin_Extension/autologin-extension
npm install
npm run build
```

### 2. Load in Browser

**Chrome:**
1. Go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `dist/manifest.json`

### 3. Configure AI Key (Optional but Recommended)

1. Get a free key from [openrouter.ai/keys](https://openrouter.ai/keys)
2. Click the extension icon in your browser toolbar
3. Click **Options**
4. Find **AI Settings** → paste your key → click **Save**

### 4. Import Your Credentials

Open Options and paste credentials in either format:

**CSV format:**
```
url,username,password
https://github.com,user@email.com,mypassword
https://reddit.com,myusername,pass456
https://twitter.com,handle,pass789
```

**Colon-delimited format:**
```
https://github.com:user@email.com:mypassword
https://reddit.com:myusername:pass456
https://twitter.com:handle:pass789
```

Hundreds of lines work fine. The importer processes them in sequence.

### 5. Run

Click the extension icon → **Developer** tab → **Start Batch Login**.

The extension opens each site in a background tab, handles the login flow, saves results, closes the tab, and moves to the next account. Progress shows live in the popup.

---

## Security

This section is written for people who are not technical. We explain exactly what happens to your passwords, in plain language.

---

### Where Your Passwords Are Stored

Your passwords **never leave your computer** except to be sent directly to the login page of the website they belong to — the same thing that happens when you type them manually.

They are stored inside your browser, in a database called IndexedDB. This is the same technology browsers use to store offline app data. It sits inside your browser's profile folder on your hard drive.

---

### Encryption

Before any password is saved to that database, it is **encrypted**. This means it is scrambled into unreadable gibberish using a mathematical process. The encryption we use is called **XSalsa20-Poly1305**, implemented through a library called TweetNaCl.js.

To give you a reference point: this is the same encryption algorithm used by Signal, the private messaging app recommended by security researchers worldwide. It is considered one of the strongest encryption methods available.

What this means practically:
- If someone copies your browser's database file off your hard drive, all they get is scrambled data
- There is no way to read the passwords without the decryption key
- The decryption key is tied to your specific browser session

---

### What the Encryption Key Is (And Its Limitation)

The encryption key is derived from your browser profile. This means:

- The passwords can only be read inside your browser, on your computer
- They **cannot** be read on someone else's computer, even if they have the database file
- **However:** if someone else has access to your Windows/Mac login, and they open your browser, they could in theory access the extension

This is the same limitation as any browser password manager (including Chrome's built-in one). If your computer account is shared or compromised, your browser data is too.

**Recommendation:** Use this extension on a computer that only you have access to. Lock your computer when you leave it.

---

### The AI Key

When you configure an AI provider key, it is stored in `chrome.storage.local` — the same secure storage area the extension uses for everything. It is:

- Never written into the extension's source code
- Never sent to any server except directly to the AI provider you chose
- Removed if you clear the extension data

The AI receives screenshots of login pages to help identify form fields. Screenshots contain page layout and content — **they do not contain your passwords**. The password is filled into the form locally, after the AI has already responded.

---

### What the Extension Can and Cannot Access

**Can access:**
- Any website you navigate to (required to fill forms)
- Browser cookies (required to save session after login)
- Browser downloads (required to save the output file)
- Browser tabs (required to open and track login pages)

**Cannot access:**
- Other extensions
- Files on your computer outside the Downloads folder
- Your browser history
- Any data on websites you are not actively logging into

---

### Honest Risk Assessment

We believe in being straightforward about risk rather than hiding it.

**Low risk scenario:** You are using this on your personal computer, you are the only person who uses it, and you have a normal OS login. The extension is as secure as your browser's built-in password manager.

**Medium risk scenario:** Multiple people have access to your Windows/Mac account, or your computer runs without a password. In this case, anyone with physical access could access your credentials.

**High risk scenario:** Your computer is shared, managed by an organization with admin access, or you have malware installed. Do not use a credential-storing tool of any kind in this scenario.

**Sites with bot protection:** Bulk automated logins will trigger security systems on some sites. Google, for example, will lock accounts after repeated failed attempts. Start with a small test batch and review results before running hundreds of accounts. Always comply with the terms of service of the sites you are accessing.

---

### ⚠️ Legal Disclaimer

> This extension is provided for legitimate automation of accounts you own. Only use it on accounts that belong to you or that you have explicit authorization to access. Unauthorized access to computer systems is illegal in most jurisdictions. The authors of this software take no legal responsibility for misuse. Bulk login automation may violate the terms of service of some websites — you are responsible for compliance.

---

## Architecture (For Technical Readers)

```
Extension Structure
───────────────────
background.js      ← Service worker. All database writes happen here.
                     Orchestrates the batch, manages state, calls AI.

content.js         ← Injected into every page. Fills forms, clicks buttons,
                     detects CAPTCHAs, captures screenshots locally.

popup.js           ← React 18 UI. Shows status, credentials list,
                     batch controls, live logs. Never touches the DB directly.

options.html/js    ← Credential import page. API key configuration.

Source Layout
─────────────
src/
├── background/worker.ts        Message router + batch orchestrator
├── content/contentMain.ts      DOM interaction handlers
├── popup/popup.tsx             React UI
├── automation/
│   ├── ai-agent.ts             OpenRouter/AI vision integration
│   ├── engine.ts               DOM-based form detection fallback
│   ├── captcha.ts              CAPTCHA detection logic
│   └── anti-detection.ts       Bot detection countermeasures
├── store/database.ts           Dexie/IndexedDB schema + CRUD
├── crypto/encryption.ts        TweetNaCl encrypt/decrypt + key derivation
├── messaging/                  Typed Chrome runtime message bus
│   ├── types.ts                Discriminated union message types
│   ├── handlers.ts             Handler registry pattern
│   └── messenger.ts            Promise-wrapped sendMessage with timeout
└── types/index.ts              Shared TypeScript interfaces
```

**Key design decisions:**
- The content script and popup have **zero database access** — all reads/writes go through the background worker via messages
- Deleting a credential **cascades** automatically to its cookies, logs, and screenshots
- The message bus has a **5 second timeout** by default; login flows use extended timeouts where needed
- All TypeScript is **strict mode** — `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`
- 389 tests across crypto, store, messaging, and automation modules

---

## Development

```bash
npm run dev           # Watch mode — rebuilds dist/ on every save
npm run build         # Production build
npm test              # Full test suite (389 tests)
npm run type-check    # TypeScript strict check — must stay at 0 errors
npm run lint          # ESLint
```

**Tech stack:**
- TypeScript 5 (strict)
- React 18
- Webpack 5
- Dexie.js (IndexedDB)
- TweetNaCl (encryption)
- Jest + ts-jest (testing)
- Chrome/Firefox Manifest V3

---

## License

MIT License. Free to use, modify, and distribute.

See the Security and Disclaimer sections above before deploying in any sensitive environment.
