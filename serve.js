// AIFA local dev server — Node built-ins only (no npm packages)
// Serves the project on http://localhost:3000
// Proxies Azure Retail Pricing API calls to avoid browser CORS restrictions
//
// Usage: node serve.js

import { createServer } from 'http';
import { readFile }     from 'fs/promises';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

// Mirrors the same normalisation used in index.html
function normalizeAzureSkuName(raw) {
  const name = (raw ?? '').startsWith('Standard_') ? raw : `Standard_${raw}`;
  return name.split(/[\s(,]/)[0].trim();
}

async function proxyAzurePrice(req, res) {
  const url        = new URL(req.url, `http://localhost:${PORT}`);
  const rawName    = url.searchParams.get('instance') ?? '';
  const armSkuName = normalizeAzureSkuName(rawName);

  const filter    = `serviceName eq 'Virtual Machines' and armRegionName eq 'eastus' and armSkuName eq '${armSkuName}'`;
  const azureUrl  = `https://prices.azure.com/api/retail/prices?$filter=${encodeURIComponent(filter)}`;

  try {
    const upstream = await fetch(azureUrl);
    const body     = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function serveStatic(req, res) {
  const url      = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;

  // Prevent path traversal
  if (pathname.includes('..')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('400 Bad Request');
    return;
  }

  const filePath = join(ROOT, pathname);

  try {
    const data        = await readFile(filePath);
    const ext         = extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${pathname}`);
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
    }
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  console.log(`${req.method} ${url.pathname}`);

  if (url.pathname === '/api/azure-price') {
    proxyAzurePrice(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nAIFA dev server →  http://localhost:${PORT}\n`);
});
