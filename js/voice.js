import { authHeaders } from './auth.js';

// Stateless voice capture. UI stays in composer.js; no chat or storage access.
export function createVoice({ onState, onTime, onText, onError }) {
  let state = 'idle', recorder, stream, interval, cap, request, generation = 0;
  function update(value) { state = value; onState(value); }
  function release() {
    clearInterval(interval); clearTimeout(cap);
    stream?.getTracks().forEach(track => track.stop()); stream = null;
  }
  function cancel() {
    generation++; request?.abort(); request = null;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorder = null; release(); update('idle');
  }
  function stop() {
    if (state !== 'recording') return;
    update('transcribing'); clearInterval(interval); clearTimeout(cap);
    recorder.stop();
  }
  async function start() {
    if (state !== 'idle') return;
    const id = ++generation;
    update('requesting');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error('unsupported');
      }
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (id !== generation) { media.getTracks().forEach(track => track.stop()); return; }
      stream = media;
      const mimeType = ['audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder = capture;
      const chunks = [];
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onerror = () => {
        if (id !== generation) return;
        cancel(); onError("That recording slipped away. Let's try again.");
      };
      capture.onstop = async () => {
        if (id !== generation) return;
        release(); recorder = null; update('transcribing');
        const type = capture.mimeType || chunks[0]?.type || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        const controller = new AbortController(); request = controller;
        const timeout = setTimeout(() => controller.abort(), 45000);
        try {
          if (!blob.size) throw new Error('empty');
          if (blob.size > 4 * 1024 * 1024) throw new Error('large');
          const response = await fetch('/api/transcribe', {
            method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-audio-format': blob.type || 'audio/webm', ...await authHeaders() },
            body: blob, signal: controller.signal
          });
          if (!response.ok) throw new Error(response.status === 413 ? 'large' : 'transcribe');
          const data = await response.json();
          if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('empty');
          if (id !== generation) return;
          update('idle'); onText(data.text.trim());
        } catch (err) {
          if (id !== generation) return;
          update('idle');
          onError(err.message === 'empty' ? "Didn't catch that. Try speaking a little closer?" : err.message === 'large' ? "That note's a little big. Try a shorter one?" : "Couldn't turn that into text. Give it another go?");
        } finally {
          clearTimeout(timeout);
          if (request === controller) request = null;
        }
      };
      capture.start();
      const started = Date.now(); onTime(0); update('recording');
      interval = setInterval(() => {
        const seconds = Math.min(60, Math.floor((Date.now() - started) / 1000));
        onTime(seconds); if (seconds >= 60) stop();
      }, 200);
      cap = setTimeout(() => { onTime(60); stop(); }, 60000);
    } catch (err) {
      if (id !== generation) return;
      release(); recorder = null; update('idle');
      onError(err.name === 'NotAllowedError' || err.name === 'SecurityError' ? "Mic's off. Allow microphone access and try again?" : err.message === 'unsupported' ? "Voice notes aren't supported here yet. Try your browser's latest version?" : "Couldn't reach your mic. Give it another go?");
    }
  }
  return { start, stop, cancel, get state() { return state; } };
}
