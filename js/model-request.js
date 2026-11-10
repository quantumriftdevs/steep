import { authHeaders } from './auth.js';
import { cooldown } from './cooldown.js';
let current;
export function beginRequest() { current?.abort(); current = new AbortController(); return current; }
export function stopRequest() { current?.abort(); }
export function finishRequest(controller) { if (current === controller) current = null; }
export async function modelRequest(body, node, active, waiting = () => {}, signal) {
  const live = () => !signal?.aborted && active();
  const check = () => { if (signal?.aborted) throw new DOMException('Stopped', 'AbortError'); if (!active()) throw new Error('Session changed'); };
  for (let retry = 0; ; retry++) {
    check(); const headers = await authHeaders(); check();
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body, signal });
    check();
    if (response.status !== 429 || retry >= 2) return response;
    const data = await response.clone().json().catch(() => ({}));
    const seconds = Number(data.retryAfter);
    if (data.retryAfter == null || !Number.isFinite(seconds) || seconds < 0) return response;
    waiting(true);
    let ready;
    try { ready = await cooldown(node, 'Model cooldown', Date.now() + seconds * 1000, live); }
    finally { waiting(false); }
    check(); if (!ready) return response;
  }
}
