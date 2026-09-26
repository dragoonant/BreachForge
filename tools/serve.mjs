#!/usr/bin/env node
// Local dev server. The game also runs from file://, but a server keeps fetch() and the
// audio decode path honest.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm' };
// PORT comes from the environment when the harness assigns one, which is what lets every
// worktree run its own server at once (CLAUDE.md rule 12) instead of fighting over 8777.
const chosen = process.argv[2] || process.env.PORT;
const port = +(chosen || 8777);
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream',
    'cache-control': 'no-store' });
  res.end(fs.readFileSync(f));
});

// A busy port arrived here as an unhandled 'error' event: twenty lines of stack whose
// actionable content was one word. It happens for two quite different reasons and the
// remedy is not the same, so say which.
//
// Moving to a free port on our own is NOT the fix. The harness assigns PORT and then opens
// a browser at that exact port, so a server that quietly relocates is a server nobody is
// looking at — which is the same class of confusion as rule 12's warning about serving the
// wrong tree, and harder to notice.
server.on('error', err => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error('serve.mjs: port ' + port + ' is already in use, so nothing is being served.');
  console.error(chosen
    // Worth ruling out first: the harness picks a free port by probing and releasing it,
    // and an ephemeral-range port can be handed to something else in between.
    ? '  This port was assigned to this process. If it is a stale BreachForge server,\n' +
      '  stop that one; if the port was auto-assigned, simply starting again may be enough.'
    : '  This is the default. Pass PORT=<n> to run a second checkout alongside the first\n' +
      '  (CLAUDE.md rule 12) rather than putting a port back into runtimeArgs.');
  console.error('  Holder:  lsof -nP -iTCP:' + port + ' -sTCP:LISTEN');
  process.exit(1);
});
server.listen(port, () => console.log('BreachForge on http://localhost:' + port));
