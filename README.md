# AI Language Translation Generator

Production‑ready Vue 3 app that translates English UI strings into any language codes using Google Gemini.

## Stack
- Frontend: Vue 3 (Vite)
- AI: Google Gemini

## What It Does
- Paste English keys (Laravel array pairs or JSON)
- Add/remove any language codes or full names dynamically
- Generate translations via Gemini
- Edit results before export (inline JSON editor)
- Export JSON or Laravel PHP arrays
- Test Gemini API key from the UI
- Cache translations + key validation results to reduce API usage
- Output viewer supports JSON or Laravel PHP format

---

# Quick Start (Local Dev)

1) **Install dependencies**

```bash
npm install
```

2) **Run dev server**

```bash
npm run dev
```

Vite: `http://localhost:5173`

3) **Add your Gemini API key in the UI**

The key is stored locally in your browser if you enable “Save key”.

Optional env overrides (create `.env` in repo root):
```
VITE_GEMINI_MODEL=gemini-2.5-flash
VITE_GEMINI_API_VERSION=v1beta
```

---

# Production (Static Build)

Builds the UI to static assets in `dist/`:

```bash
npm run build
```

This build embeds JS/CSS into `dist/index.html` using `data:` URLs, so you can open that file directly in a browser or host the `dist/` folder on any static host (Vercel, Netlify, S3, nginx, etc).

---

# UI Input Formats

### Laravel array pairs
```
'save' => 'Save',
'upd8' => 'Update',
'twitter' => 'X',
```

### JSON
```
{
  "save": "Save",
  "upd8": "Update",
  "twitter": "X"
}
```

### Languages
Accepts ISO codes (e.g. `fr`, `zh-CN`) or full language names (e.g. `French`, `Simplified Chinese`).

---

# Troubleshooting

### 1) API returns 429 / LIMIT_REACHED
Free key rate‑limit hit. Wait or use another key.

### 2) Invalid key
Make sure the key is from **Google AI Studio** and not a generic Cloud key.

### 3) Model not found
Ensure:
```
VITE_GEMINI_MODEL=gemini-2.5-flash
VITE_GEMINI_API_VERSION=v1beta
```

---

# Security Note

This is a frontend‑only app. Your Gemini API key is sent directly from the browser to Google, which means it is visible in the browser environment. Use a restricted key and do not deploy with a sensitive or billing‑critical key unless you accept that risk.

---

# Scripts

- `npm run build` → Build frontend only
- `npm run dev` → Vite
- `npm run prod` → Build frontend only
- `npm run server` → Serve Laravel only

---

# Notes
- No hardcoded language list restrictions
- You can edit translations before export
- Caching reduces API usage
