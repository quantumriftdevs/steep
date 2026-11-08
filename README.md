# Steep

Steep is an AI assistant for TikTok creators: a friendly place to talk niches, RPM, editing, growth, strikes, monetization and appeals. This v1 is a web chat demo, not an official TikTok product.

## File map

- `index.html` — landing page structure.
- `css/landing-core.css` — landing base, navigation and hero styles.
- `css/landing-sections.css` — landing section, responsive and animation styles.
- `app/index.html` — chat app structure.
- `css/app.css` — chat layout and responsive styles.
- `js/app.js` — chat interaction, requests and connection state.
- `js/store.js` — local conversation persistence.
- `js/markdown.js` — safe markdown-lite rendering.
- `js/messages.js` — message bubbles and word-by-word display.
- `api/chat.js` — Groq request and reply endpoint.
- `api/status.js` — reports whether the API key is configured.
- `api/personality.js` — editable system prompt for Steep.
- `README.md` — project map and deployment steps.

## Deploy from your phone

1. In Vercel, import the `quantumriftdevs/steep` GitHub repository as a new project. Choose the **Other** framework preset; no build settings are needed.
2. In the project's **Settings > Environment Variables**, add `GROQ_API_KEY` with the key from your Groq account. Never put the key in this repository.
3. Redeploy the project and open its assigned `*.vercel.app` URL. The landing page is at `/` and the chat is at `/app/`.

Optionally set `GROQ_MODEL` in Vercel to override the default `openai/gpt-oss-120b` text model, or `GROQ_VISION_MODEL` to override the default `qwen/qwen3.8-27b` vision model, then redeploy. The status indicator validates the configured Groq key with the models endpoint. Replies appear word by word after the server receives the full answer.

Chats are stored in the browser's localStorage on that device. This demo has no sign-in or rate limiting: a public deployment allows visitors to use the chat endpoint and potentially consume your Groq quota or incur charges. Check your Groq usage and billing settings before sharing it widely. Steep can make mistakes; check current TikTok rules before acting..
<!-- deploy trigger Nov 6 -->

<!-- Native attachment picker deployment refresh: 2026-11-07. -->
