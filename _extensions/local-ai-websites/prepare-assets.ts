// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
// Run with Quarto's bundled Deno. Node is required only for the explicit local
// SDK bundling operation; no inference, package installation or download occurs.
const script = new URL('./prepare-assets.mjs', import.meta.url);
const command = new Deno.Command('node', {args: [decodeURIComponent(script.pathname).replace(/^\/([A-Za-z]:\/)/, '$1'), ...Deno.args],
  stdin: 'inherit', stdout: 'inherit', stderr: 'inherit'});
try { Deno.exit((await command.spawn().status).code); }
catch { console.error('Local AI asset preparation requires Node.js 24 or later on PATH. Install Node.js, then repeat this Quarto command.'); Deno.exit(1); }
