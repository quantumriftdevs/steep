import { onAuthChange, sendCode, verifyCode, maskEmail } from './auth.js';

// View only; session and network logic live in auth.js.
const $ = id => document.getElementById(id);
const view = $('auth-view'), shell = document.querySelector('.shell');
const emailForm = $('auth-email-form'), codeForm = $('auth-code-form');
const emailInput = $('auth-email'), notice = $('auth-error');
const boxes = Array.from(document.querySelectorAll('.auth-digit'));
let email = '', busy = false;
function message(text) { notice.textContent = text; notice.hidden = !text; }
function screen(code) {
  emailForm.hidden = code; codeForm.hidden = !code;
  $('auth-title').hidden = !code;
  $('auth-intro').textContent = code ? 'We sent a 6-digit code to ' + maskEmail(email) : 'Enter your email to sign in or create your account';
  message(''); (code ? boxes[0] : emailInput).focus();
}
function pending(value, button, label) {
  busy = value;
  view.querySelectorAll('input,button').forEach(node => { node.disabled = value; });
  button.setAttribute('aria-busy', String(value)); button.setAttribute('aria-label', label);
}
async function deliver(button, resend = false) {
  if (busy) return;
  message(''); pending(true, button, 'Sending code');
  $('auth-status').textContent = 'Sending your code…';
  try {
    await sendCode(email);
    codeForm.reset(); screen(true);
    $('auth-status').textContent = resend ? 'A fresh code is on its way.' : '';
  } catch (error) {
    message(error.message.startsWith('Email codes') || error.message.startsWith('We could') || error.message.startsWith('Sign-in') ? error.message : 'Could not connect. Please try again.');
    $('auth-status').textContent = '';
  } finally {
    pending(false, button, resend ? 'Resend code' : 'Continue');
    if (!codeForm.hidden) boxes[0].focus();
  }
}
emailForm.addEventListener('submit', event => {
  event.preventDefault(); if (busy) return;
  const value = emailInput.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    message('Please enter a valid email address.'); emailInput.setAttribute('aria-invalid', 'true'); emailInput.focus(); return;
  }
  emailInput.removeAttribute('aria-invalid'); email = value;
  deliver($('auth-continue'));
});
boxes.forEach((box, index) => {
  box.addEventListener('input', () => {
    const digits = box.value.replace(/\D/g, '');
    box.value = digits.slice(-1); message('');
    if (digits.length > 1) {
      digits.slice(0, 6 - index).split('').forEach((digit, offset) => { boxes[index + offset].value = digit; });
      boxes[Math.min(5, index + digits.length)].focus();
    } else if (box.value && index < 5) boxes[index + 1].focus();
  });
  box.addEventListener('keydown', event => {
    if (event.key === 'Backspace' && !box.value && index > 0) { event.preventDefault(); boxes[index - 1].value = ''; boxes[index - 1].focus(); }
    if (event.key === 'ArrowLeft' && index > 0) boxes[index - 1].focus();
    if (event.key === 'ArrowRight' && index < 5) boxes[index + 1].focus();
  });
  box.addEventListener('paste', event => {
    const digits = (event.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    event.preventDefault(); boxes.forEach((node, i) => { node.value = digits[i] || ''; });
    message(''); boxes[Math.min(5, digits.length)].focus();
  });
  box.addEventListener('focus', () => box.select());
});
codeForm.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const token = boxes.map(box => box.value).join('');
  if (!/^\d{6}$/.test(token)) { message('Enter all six digits from your email.'); return; }
  const button = $('auth-verify'); message(''); pending(true, button, 'Verifying code'); button.textContent = 'Verifying…';
  try { await verifyCode(email, token); }
  catch (error) { message(error.message.startsWith('That code') || error.message.startsWith('Please') ? error.message : 'Could not connect. Please try again.'); }
  finally { pending(false, button, 'Verify'); button.textContent = 'Verify'; }
});
$('auth-resend').onclick = () => deliver($('auth-resend'), true);
$('auth-different').onclick = () => { if (!busy) { codeForm.reset(); $('auth-status').textContent = ''; screen(false); } };
onAuthChange(session => {
  shell.hidden = !session; shell.inert = !session; view.hidden = !!session;
  if (!session) { codeForm.reset(); $('auth-status').textContent = ''; screen(false); }
});
