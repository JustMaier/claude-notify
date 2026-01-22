import { createServer } from 'http';
import webpush from 'web-push';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));

const PORT = process.env.PORT || 3939;
const SUBSCRIPTIONS_FILE = join(rootDir, 'data', 'subscriptions.json');
const VAPID_FILE = join(rootDir, 'data', 'vapid.json');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// VAPID keys
function loadVapidKeys() {
  if (existsSync(VAPID_FILE)) {
    return JSON.parse(readFileSync(VAPID_FILE, 'utf8'));
  }
  console.log('Generating new VAPID keys...');
  const vapidKeys = webpush.generateVAPIDKeys();
  writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
  console.log('VAPID keys saved to data/vapid.json');
  return vapidKeys;
}

const vapidKeys = loadVapidKeys();
webpush.setVapidDetails('mailto:notifications@localhost', vapidKeys.publicKey, vapidKeys.privateKey);

// Subscriptions
function loadSubscriptions() {
  if (existsSync(SUBSCRIPTIONS_FILE)) {
    return JSON.parse(readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
  }
  return [];
}

function saveSubscriptions(subs) {
  writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2));
}

let subscriptions = loadSubscriptions();

// Helpers
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, filePath) {
  const fullPath = join(rootDir, 'public', filePath === '/' ? 'index.html' : filePath);
  if (!existsSync(fullPath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = extname(fullPath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(readFileSync(fullPath));
}

// Routes
async function handleRequest(req, res) {
  const { method, url } = req;

  // API routes
  if (url === '/health' && method === 'GET') {
    return json(res, {
      status: 'ok',
      version: packageJson.version,
      name: packageJson.name,
      uptime: process.uptime(),
      subscriptions: subscriptions.length
    });
  }

  if (url === '/vapid-public-key' && method === 'GET') {
    return json(res, { publicKey: vapidKeys.publicKey });
  }

  if (url === '/subscribe' && method === 'POST') {
    const body = await parseBody(req);
    if (!body?.endpoint) {
      return json(res, { error: 'Invalid subscription' }, 400);
    }
    if (!subscriptions.some(s => s.endpoint === body.endpoint)) {
      subscriptions.push(body);
      saveSubscriptions(subscriptions);
      console.log('New subscription added. Total:', subscriptions.length);
    }
    return json(res, { success: true, message: 'Subscribed successfully' });
  }

  if (url === '/unsubscribe' && method === 'POST') {
    const { endpoint } = await parseBody(req);
    if (!endpoint) {
      return json(res, { error: 'Endpoint required' }, 400);
    }
    const before = subscriptions.length;
    subscriptions = subscriptions.filter(s => s.endpoint !== endpoint);
    saveSubscriptions(subscriptions);
    return json(res, { success: true, removed: before - subscriptions.length });
  }

  if (url === '/notify' && method === 'POST') {
    const { title, body, icon, url: notifyUrl, tag } = await parseBody(req);
    if (!title) {
      return json(res, { error: 'Title is required' }, 400);
    }

    const payload = JSON.stringify({
      title,
      body: body || '',
      icon: icon || '/icon.svg',
      url: notifyUrl || '/',
      tag: tag || 'claude-notify',
      timestamp: Date.now()
    });

    const results = { sent: 0, failed: 0, errors: [] };
    const invalidEndpoints = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
        results.sent++;
      } catch (err) {
        results.failed++;
        results.errors.push(err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          invalidEndpoints.push(sub.endpoint);
        }
      }
    }

    if (invalidEndpoints.length > 0) {
      subscriptions = subscriptions.filter(s => !invalidEndpoints.includes(s.endpoint));
      saveSubscriptions(subscriptions);
    }

    return json(res, results);
  }

  // Static files
  serveStatic(res, url);
}

// Server
const server = createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    console.error('Error:', err.message);
    json(res, { error: err.message }, 500);
  });
});

server.listen(PORT, () => {
  console.log(`claude-notify v${packageJson.version} running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Subscriptions: ${subscriptions.length}`);
});
