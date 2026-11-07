import { checkConnection } from './status.js';

// One status request on this page load; no polling or chat-header status.
checkConnection();
