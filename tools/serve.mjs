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
const port = +(process.argv[2] || process.env.PORT || 8777);
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream',
    'cache-control': 'no-store' });
  res.end(fs.readFileSync(f));
}).listen(port, () => console.log('BreachForge on http://localhost:' + port));
