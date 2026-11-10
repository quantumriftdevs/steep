import { profileName } from './profile.js';

function greeting(name) {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return `Good ${time}${name ? ', ' + name : '.'}`;
}
export function setupGreeting(empty) {
  empty.querySelector('h1').textContent = greeting(profileName());
  empty.querySelector('.name-form').hidden = true;
}
