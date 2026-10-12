// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kai Prince
// LiteRT-LM 0.18.0's WASM loader uses importScripts when it exists. A classic
// worker supplies that interface; module workers expose it but reject calls.
// Import our own ES module without eval and retain the one initial load message.
(() => {
  const queued = [];
  const wait = event => {
    if (queued.length) {
      self.postMessage({id: event.data?.id, type: 'error', message: 'The local AI worker is still initialising.'});
      return;
    }
    queued.push(event);
  };
  self.onmessage = wait;
  import('./runtime-worker.js').then(() => {
    const handler = self.onmessage;
    if (handler === wait || typeof handler !== 'function') throw new Error('Missing worker handler.');
    for (const event of queued.splice(0)) void handler(event);
  }).catch(() => {
    for (const event of queued.splice(0)) self.postMessage({id: event.data?.id, type: 'error',
      message: 'The local AI worker could not initialise. Source search remains available.'});
    self.close();
  });
})();
