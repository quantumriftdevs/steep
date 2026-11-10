import { authHeaders } from './auth.js';
import { cooldown } from './cooldown.js';
// The caller owns conversation/account cancellation and final error copy.
export async function modelRequest(body, node, active, waiting = () => {}) {
  for (let retry = 0; ; retry++) {
    const headers = await authHeaders();
    if (!active()) throw new Error('Session changed');
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
    if (!active()) return response;
    if (response.status !== 429 || retry >= 2) return response;
    const data = await response.clone().json().catch(() => ({}));
    const seconds = Number(data.retryAfter);
    // Do not invent a waiting period when upstream provides no retry data.
    if (data.retryAfter == null || !Number.isFinite(seconds) || seconds < 0) return response;
    waiting(true);
    let ready;
    try { ready = await cooldown(node, 'Model cooldown', Date.now() + seconds * 1000, active); }
    finally { waiting(false); }
    if (!ready) return response;
  }
}
