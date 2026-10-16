// Минимальный сервер для развёртывания на собственном VPS: статика + /api/catalog + /api/health.
// Без внешних зависимостей. Запуск: npm run build && npm start
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSheetsClient } from './catalog.mjs';

const ROOT = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8080);
const sheets = createSheetsClient();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ico': 'image/x-icon',
};

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(self), geolocation=()',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(ROOT, 'index.html'); // SPA
  }
  try {
    const data = await readFile(file);
    const cacheable = file.includes(`${join(ROOT, 'assets')}`);
    send(res, 200, data, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cacheable ? 'public, max-age=31536000, immutable' : 'no-cache' });
  } catch {
    send(res, 404, 'Not found');
  }
}

createServer(async (req, res) => {
  try {
    if (req.url === '/api/health') return send(res, 200, JSON.stringify({ ok: true, catalog: sheets.mode }), { 'Content-Type': 'application/json' });
    if (req.url?.startsWith('/api/catalog')) {
      if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
      const force = new URL(req.url, 'http://x').searchParams.get('refresh') === '1' && req.headers['x-admin-token'] === process.env.ADMIN_TOKEN && !!process.env.ADMIN_TOKEN;
      const r = await sheets.getCatalog({ force });
      return send(res, r.status, JSON.stringify(r.body), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    await serveStatic(req, res);
  } catch (e) {
    console.error(e);
    send(res, 500, 'Internal error');
  }
}).listen(PORT, () => console.log(`3D Home Academy: http://localhost:${PORT} · каталог: ${sheets.mode}`));
