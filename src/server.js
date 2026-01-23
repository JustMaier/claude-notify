import 'dotenv/config';
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
// VAPID subject must be a real email or https URL - Apple rejects localhost
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:notify@justinmaier.com';
webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);

// Subscriptions - new format: { endpoint: { subscription: {...}, tokens: [...] } }
function loadSubscriptions() {
  if (existsSync(SUBSCRIPTIONS_FILE)) {
    const data = JSON.parse(readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));

    // Migrate old array format to new object format
    if (Array.isArray(data)) {
      console.log('Migrating subscriptions from array to object format...');
      const migrated = {};
      for (const sub of data) {
        if (sub.endpoint) {
          migrated[sub.endpoint] = {
            subscription: sub,
            tokens: [] // Legacy subscriptions start with empty tokens
          };
        }
      }
      saveSubscriptions(migrated);
      console.log(`Migrated ${Object.keys(migrated).length} subscriptions`);
      return migrated;
    }

    return data;
  }
  return {};
}

function saveSubscriptions(subs) {
  writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2));
}

function getSubscriptionsForToken(token) {
  const results = [];
  for (const [endpoint, entry] of Object.entries(subscriptions)) {
    if (entry.tokens.includes(token)) {
      results.push(entry.subscription);
    }
  }
  return results;
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
      subscriptions: Object.keys(subscriptions).length
    });
  }

  if (url === '/vapid-public-key' && method === 'GET') {
    return json(res, { publicKey: vapidKeys.publicKey });
  }

  if (url === '/subscribe' && method === 'POST') {
    const body = await parseBody(req);
    const { token, subscription } = body;

    // Support both new format { token, subscription } and legacy format { endpoint, keys }
    const sub = subscription || body;
    if (!sub?.endpoint) {
      return json(res, { error: 'Invalid subscription: endpoint required' }, 400);
    }
    if (!token) {
      return json(res, { error: 'Token is required' }, 400);
    }

    const endpoint = sub.endpoint;
    console.log(`Subscribe request: token="${token}", endpoint="${endpoint.substring(0, 50)}..."`);
    console.log(`Existing endpoints: ${Object.keys(subscriptions).length}`);

    if (subscriptions[endpoint]) {
      // Endpoint exists - add token if not already present
      console.log(`Found existing endpoint with tokens: ${JSON.stringify(subscriptions[endpoint].tokens)}`);
      if (!subscriptions[endpoint].tokens.includes(token)) {
        subscriptions[endpoint].tokens.push(token);
        saveSubscriptions(subscriptions);
        console.log(`Token "${token}" added. Endpoint now has ${subscriptions[endpoint].tokens.length} tokens: ${JSON.stringify(subscriptions[endpoint].tokens)}`);
      } else {
        console.log(`Token "${token}" already exists for this endpoint`);
      }
    } else {
      // New endpoint - create entry
      console.log(`Creating new endpoint entry for token "${token}"`);
      subscriptions[endpoint] = {
        subscription: sub,
        tokens: [token]
      };
      saveSubscriptions(subscriptions);
      console.log('New subscription added. Total:', Object.keys(subscriptions).length);
    }
    return json(res, { success: true, message: 'Subscribed successfully', tokens: subscriptions[endpoint].tokens });
  }

  if (url === '/unsubscribe' && method === 'POST') {
    const { endpoint, token } = await parseBody(req);
    if (!endpoint) {
      return json(res, { error: 'Endpoint required' }, 400);
    }

    if (!subscriptions[endpoint]) {
      return json(res, { success: true, removed: 0 });
    }

    if (token) {
      // Remove specific token from endpoint
      const before = subscriptions[endpoint].tokens.length;
      subscriptions[endpoint].tokens = subscriptions[endpoint].tokens.filter(t => t !== token);
      const removed = before - subscriptions[endpoint].tokens.length;

      // If no tokens left, remove the entire endpoint
      if (subscriptions[endpoint].tokens.length === 0) {
        delete subscriptions[endpoint];
        console.log('Endpoint removed (no tokens left)');
      }

      saveSubscriptions(subscriptions);
      return json(res, { success: true, removed, tokens: subscriptions[endpoint]?.tokens || [] });
    } else {
      // Remove entire endpoint entry
      delete subscriptions[endpoint];
      saveSubscriptions(subscriptions);
      return json(res, { success: true, removed: 1 });
    }
  }

  if (url === '/notify' && method === 'POST') {
    const { token, title, body, icon, url: notifyUrl, tag } = await parseBody(req);
    if (!token) {
      return json(res, { error: 'Token is required' }, 400);
    }
    if (!title) {
      return json(res, { error: 'Title is required' }, 400);
    }

    // Web push payload limit is 4KB. Validate individual fields and total size.
    const MAX_TITLE_BYTES = 200;
    const MAX_BODY_BYTES = 2000;
    const MAX_PAYLOAD_BYTES = 4000; // Safe margin below 4096

    const titleBytes = Buffer.byteLength(title, 'utf8');
    if (titleBytes > MAX_TITLE_BYTES) {
      return json(res, { error: `Title exceeds ${MAX_TITLE_BYTES} bytes (got ${titleBytes})` }, 400);
    }

    if (body) {
      const bodyBytes = Buffer.byteLength(body, 'utf8');
      if (bodyBytes > MAX_BODY_BYTES) {
        return json(res, { error: `Body exceeds ${MAX_BODY_BYTES} bytes (got ${bodyBytes})` }, 400);
      }
    }

    const payload = JSON.stringify({
      title,
      body: body || '',
      icon: icon || '/icon.svg',
      url: notifyUrl || '/',
      tag: tag || 'claude-notify',
      timestamp: Date.now()
    });

    const payloadBytes = Buffer.byteLength(payload, 'utf8');
    if (payloadBytes > MAX_PAYLOAD_BYTES) {
      return json(res, { error: `Payload exceeds ${MAX_PAYLOAD_BYTES} bytes (got ${payloadBytes})` }, 400);
    }

    // Get subscriptions for this token
    const targetSubs = getSubscriptionsForToken(token);
    console.log(`Notify request: token="${token}", title="${title}"`);
    console.log(`Found ${targetSubs.length} subscriptions for token "${token}"`);
    if (targetSubs.length === 0) {
      console.log(`All subscriptions and their tokens:`);
      for (const [ep, entry] of Object.entries(subscriptions)) {
        console.log(`  - ${ep.substring(0, 50)}... -> tokens: ${JSON.stringify(entry.tokens)}`);
      }
    }
    const results = { sent: 0, failed: 0, errors: [], recipients: targetSubs.length };
    const invalidEndpoints = [];

    for (const sub of targetSubs) {
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

    // Clean up invalid endpoints
    if (invalidEndpoints.length > 0) {
      for (const endpoint of invalidEndpoints) {
        delete subscriptions[endpoint];
      }
      saveSubscriptions(subscriptions);
    }

    return json(res, results);
  }

  // GET /subscriptions/:endpoint - returns tokens for a given endpoint
  if (url.startsWith('/subscriptions/') && method === 'GET') {
    const endpoint = decodeURIComponent(url.slice('/subscriptions/'.length));
    if (!endpoint) {
      return json(res, { error: 'Endpoint required' }, 400);
    }

    const entry = subscriptions[endpoint];
    if (!entry) {
      return json(res, { tokens: [] });
    }

    return json(res, { tokens: entry.tokens });
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
  console.log(`Subscriptions: ${Object.keys(subscriptions).length}`);
});
