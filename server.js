/**
 * Servidor estático Orbty (login, mapa, admin).
 * Uso: npm start
 */
const express = require('express');
const session = require('express-session');
const dotenv = require('dotenv');
const path = require('path');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 5500;
const ROOT = __dirname;

// Carrega .env por caminho absoluto (não depende do diretório de execução do Node).
dotenv.config({ path: path.join(__dirname, '.env') });

// Remove a página/fluxo de login do processo (sem excluir arquivos).
// Padrão: login DESATIVADO (entra direto no app). Para reativar, use ORBTY_AUTH_DISABLED=false.
const _authDisabledRaw = String(process.env.ORBTY_AUTH_DISABLED || '').trim();
const ORBTY_AUTH_DISABLED =
  _authDisabledRaw === '' ? true : !/^(0|false|no)$/i.test(_authDisabledRaw) && /^(1|true|yes)$/i.test(_authDisabledRaw);

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    name: 'orbty.sid',
    secret: process.env.ORBTY_SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // em HTTPS, coloque true
      maxAge: 1000 * 60 * 60 * 8, // 8h
    },
  })
);

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function getUsersFromEnv() {
  // Credenciais NÃO ficam no frontend nem no repositório: use .env local no servidor.
  // Formato:
  // ORBTY_USER_EMAIL=teste@cetesb.com.br
  // ORBTY_USER_PASSWORD=1234
  // ORBTY_ADMIN_EMAIL=adm@cetesb.com.br
  // ORBTY_ADMIN_PASSWORD=1234
  const userEmail = normalizeEmail(process.env.ORBTY_USER_EMAIL);
  const userPass = String(process.env.ORBTY_USER_PASSWORD || '');
  const adminEmail = normalizeEmail(process.env.ORBTY_ADMIN_EMAIL);
  const adminPass = String(process.env.ORBTY_ADMIN_PASSWORD || '');

  const users = [];
  if (userEmail && userPass) users.push({ email: userEmail, password: userPass, role: 'operator' });
  if (adminEmail && adminPass) users.push({ email: adminEmail, password: adminPass, role: 'admin' });
  return users;
}

function warnIfMissingEnv() {
  if (ORBTY_AUTH_DISABLED) return;
  const missing = [];
  if (!process.env.ORBTY_SESSION_SECRET) missing.push('ORBTY_SESSION_SECRET');
  if (!process.env.ORBTY_USER_EMAIL) missing.push('ORBTY_USER_EMAIL');
  if (!process.env.ORBTY_USER_PASSWORD) missing.push('ORBTY_USER_PASSWORD');
  if (!process.env.ORBTY_ADMIN_EMAIL) missing.push('ORBTY_ADMIN_EMAIL');
  if (!process.env.ORBTY_ADMIN_PASSWORD) missing.push('ORBTY_ADMIN_PASSWORD');
  if (missing.length) {
    console.warn('');
    console.warn('⚠️  Orbty auth: faltam variáveis de ambiente no .env: ' + missing.join(', '));
    console.warn('   Crie "'.concat(path.join(__dirname, '.env'), '" (use .env.example como base).'));
    console.warn('');
  }
}
warnIfMissingEnv();

function requireAuth(req, res, next) {
  if (ORBTY_AUTH_DISABLED) return next();
  if (req.session && req.session.user && req.session.user.email) return next();
  return res.redirect('/login.html');
}

function requireAuthApi(req, res, next) {
  if (ORBTY_AUTH_DISABLED) return next();
  if (req.session && req.session.user && req.session.user.email) return next();
  return res.status(401).json({ ok: false, message: 'Não autenticado.' });
}

function requireAdmin(req, res, next) {
  if (ORBTY_AUTH_DISABLED) return next();
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.redirect('/');
}

function httpsGetText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error('HTTP ' + res.statusCode + ' em ' + url));
          res.resume();
          return;
        }
        res.setEncoding('utf8');
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function extractXmlKeys(xmlText) {
  const keys = [];
  if (!xmlText) return keys;
  const re = /<Key>([^<]+)<\/Key>/g;
  let m;
  while ((m = re.exec(xmlText))) {
    const k = m[1];
    if (k) keys.push(k);
  }
  return keys;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeHeaderName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function detectDelimiter(headerLine) {
  const line = String(headerLine || '');
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestScore = -1;
  candidates.forEach((d) => {
    const score = line.split(d).length;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  });
  return best;
}

function splitCsvLine(line, delimiter) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseDateToYYYYMMDD(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) return raw;
  const onlyDigits = raw.replace(/\D/g, '');
  if (/^\d{8}$/.test(onlyDigits)) return onlyDigits;
  const mIso = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(raw);
  if (mIso) return mIso[1] + mIso[2] + mIso[3];
  const mBr = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(raw);
  if (mBr) return mBr[3] + mBr[2] + mBr[1];
  return null;
}

function parseAreaHa(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim();
  if (!s) return null;
  const normalized = s.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatDateLabel(dateYYYYMMDD) {
  const d = String(dateYYYYMMDD || '');
  if (!/^\d{8}$/.test(d)) return d;
  return d.slice(6, 8) + '/' + d.slice(4, 6) + '/' + d.slice(0, 4);
}

function buildGcsMediaUrls(bucket, key) {
  const cleanKey = String(key || '').replace(/^\/+/, '');
  const pathEncoded = cleanKey.split('/').map(encodeURIComponent).join('/');
  return [
    'https://storage.googleapis.com/' + bucket + '/' + pathEncoded,
    'https://storage.googleapis.com/download/storage/v1/b/' +
      bucket +
      '/o/' +
      encodeURIComponent(cleanKey) +
      '?alt=media',
  ];
}

async function httpsGetTextFirstSuccessful(urls) {
  let lastErr = null;
  for (const url of urls || []) {
    try {
      return await httpsGetText(url);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Falha ao obter conteúdo remoto.');
}

/**
 * Prefixo GCS (sem barra final) dos mosaicos COG CDOM — padrão:
 * bucket orbty-cdom-tiete → PlanetScope/CDOM_MOSAICS_COG/<YYYYMMDD>/*.tif
 * Sobrescrever com ORBTY_CDOM_PREFIX.
 */
const CDOM_GCS_PREFIX = (process.env.ORBTY_CDOM_PREFIX || 'PlanetScope/CDOM_MOSAICS_COG').replace(
  /\/+$/,
  '',
);

/** Chaves TIFF permitidas no proxy /api/raster/cdom: somente COGs sob o prefixo configurado. */
function isAllowedCdomRasterKey(cleanKey) {
  const k = String(cleanKey || '');
  if (!k || k.includes('..')) return false;
  const re = new RegExp('^' + escapeRegex(CDOM_GCS_PREFIX) + '/\\d{8}/[^/]+\\.tif$', 'i');
  return re.test(k);
}

/** CSV de segmentos CDOM (gráficos): chave no bucket ORBTY_BUCKET_NAME. Sobrescreva com ORBTY_CDOM_SEGMENTS_KEY. */
const CDOM_SEGMENTS_CSV_KEY = String(
  process.env.ORBTY_CDOM_SEGMENTS_KEY || 'PlanetScope/CDOM_Segments_Planet.csv',
).replace(/^\/+/, '');

function isSafeGcsObjectKey(key) {
  if (!key || key.length > 512) return false;
  if (key.includes('..') || key.startsWith('/') || /\s/.test(key)) return false;
  return /^[A-Za-z0-9_.\-\/]+$/.test(key);
}

async function listBucketKeysPublic(bucketName, prefix) {
  // Usa a listagem XML pública do GCS (s3-like). Sem autenticação.
  // Ex.: https://storage.googleapis.com/<bucket>?prefix=Sentinel_2/MACROFITA/
  const base = 'https://storage.googleapis.com/' + bucketName;
  const url = base + '?prefix=' + encodeURIComponent(prefix || '');
  const xml = await httpsGetText(url);
  return extractXmlKeys(xml);
}

app.post('/api/login', (req, res) => {
  if (ORBTY_AUTH_DISABLED) {
    return res.status(410).json({
      ok: false,
      message: 'Login desativado neste servidor.',
    });
  }
  const email = normalizeEmail(req.body && req.body.email);
  const password = String((req.body && req.body.password) || '');
  const roleRequested = String((req.body && req.body.role) || 'operator');

  const users = getUsersFromEnv();
  const u = users.find((x) => x.email === email && x.password === password);
  if (!u) return res.status(401).json({ ok: false, message: 'Usuário ou senha inválidos.' });

  // admin pode logar tanto como admin quanto como usuário (mapa)
  const role =
    u.role === 'admin'
      ? (roleRequested === 'admin' ? 'admin' : 'operator')
      : 'operator';

  req.session.user = { email: u.email, role };
  return res.json({ ok: true, role });
});

app.post('/api/logout', (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (ORBTY_AUTH_DISABLED) {
    return res.json({ ok: true, user: { email: null, role: 'operator' } });
  }
  const u = req.session && req.session.user ? req.session.user : null;
  if (!u) return res.status(401).json({ ok: false });
  return res.json({ ok: true, user: { email: u.email, role: u.role } });
});

/** Confirma que o servidor Node Orbty está a correr (não Live Server só com HTML). */
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, server: 'orbty-express' });
});

/** Prefixo CDOM no bucket (para o mapa alinhar fallback com o servidor). Sem auth. */
app.get('/api/config/cdom', (req, res) => {
  res.json({
    ok: true,
    cdomPrefix: CDOM_GCS_PREFIX,
    bucket: process.env.ORBTY_BUCKET_NAME || 'orbty-cdom-tiete',
  });
});

/** Estado do auth (para ver se login está desativado). Sem auth. */
app.get('/api/config/auth', (req, res) => {
  res.json({ ok: true, authDisabled: ORBTY_AUTH_DISABLED });
});

/**
 * CSV de segmentos CDOM (gráficos Comparação / Semanal): lê do GCS e devolve no mesmo origin (sessão + sem CORS).
 */
app.get('/api/cdom/segments-csv', requireAuthApi, async (req, res) => {
  try {
    if (!isSafeGcsObjectKey(CDOM_SEGMENTS_CSV_KEY)) {
      return res.status(500).json({
        ok: false,
        message: 'Chave ORBTY_CDOM_SEGMENTS_KEY inválida no servidor.',
      });
    }
    const bucket = process.env.ORBTY_BUCKET_NAME || 'orbty-cdom-tiete';
    const csvText = await httpsGetTextFirstSuccessful(buildGcsMediaUrls(bucket, CDOM_SEGMENTS_CSV_KEY));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    // Sem cache: o objetivo é refletir alterações no bucket quase imediatamente no frontend.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).send(csvText);
  } catch (err) {
    return res.status(502).json({
      ok: false,
      message: err && err.message ? err.message : String(err),
    });
  }
});

/**
 * Proxy do TIFF no GCS — mesmo origin que a página, evita CORS no browser (OpenLayers GeoTIFF / fetch).
 * Encaminha Range para leitura parcial de COG.
 */
function pipeHttpsToRes(req, res, upstreamUrl, allowFallback, fallbackUrl) {
  const parsed = new URL(upstreamUrl);
  const opts = {
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    headers: {},
  };
  if (req.headers.range) opts.headers.Range = req.headers.range;

  https
    .get(opts, (upRes) => {
      if (upRes.statusCode === 301 || upRes.statusCode === 302) {
        upRes.resume();
        if (!res.headersSent) {
          res.status(502).json({ ok: false, message: 'Redirecionamento inesperado do armazenamento.' });
        }
        return;
      }
      if (upRes.statusCode === 404 && allowFallback && fallbackUrl) {
        upRes.resume();
        return pipeHttpsToRes(req, res, fallbackUrl, false, null);
      }
      if (!upRes.statusCode || upRes.statusCode >= 400) {
        upRes.resume();
        if (!res.headersSent) {
          res.status(upRes.statusCode === 404 ? 404 : 502).json({
            ok: false,
            message: 'Falha ao obter o raster no armazenamento.',
          });
        }
        return;
      }
      const code = upRes.statusCode;
      if (code >= 200 && code < 300) {
        res.status(code);
      }
      res.setHeader('Content-Type', upRes.headers['content-type'] || 'image/tiff');
      if (upRes.headers['content-length']) {
        res.setHeader('Content-Length', upRes.headers['content-length']);
      }
      if (upRes.headers['content-range']) {
        res.setHeader('Content-Range', upRes.headers['content-range']);
      }
      res.setHeader('Accept-Ranges', upRes.headers['accept-ranges'] || 'bytes');
      res.setHeader('Cache-Control', 'private, max-age=60');
      upRes.pipe(res);
    })
    .on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ ok: false, message: err.message || String(err) });
      }
    });
}

app.get('/api/raster/cdom', (req, res) => {
  const key = req.query && req.query.key;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ ok: false, message: 'Parâmetro key ausente.' });
  }
  const cleanKey = String(key).replace(/^\/+/, '');
  if (!isAllowedCdomRasterKey(cleanKey)) {
    return res.status(400).json({ ok: false, message: 'Chave de objeto inválida.' });
  }
  const bucket = process.env.ORBTY_BUCKET_NAME || 'orbty-cdom-tiete';
  const pathEncoded = cleanKey.split('/').map(encodeURIComponent).join('/');
  const primaryUrl = 'https://storage.googleapis.com/' + bucket + '/' + pathEncoded;
  const fallbackUrl =
    'https://storage.googleapis.com/download/storage/v1/b/' +
    bucket +
    '/o/' +
    encodeURIComponent(cleanKey) +
    '?alt=media';

  pipeHttpsToRes(req, res, primaryUrl, true, fallbackUrl);
});

// Lista datas/camadas CDOM: apenas orbty-cdom-tiete/PlanetScope/CDOM_MOSAICS_COG/… (prefixo em ORBTY_CDOM_PREFIX).
app.get('/api/layers/cdom', requireAuthApi, async (req, res) => {
  try {
    const bucket = process.env.ORBTY_BUCKET_NAME || 'orbty-cdom-tiete';
    const keys = await listBucketKeysPublic(bucket, CDOM_GCS_PREFIX + '/');
    const re = new RegExp('^' + escapeRegex(CDOM_GCS_PREFIX) + '/(\\d{8})/([^/]+\\.tif)$', 'i');
    const keyByDate = new Map();
    function scoreKey(key) {
      let s = 0;
      if (/wmed/i.test(key)) s += 4;
      if (/mosaic/i.test(key)) s += 2;
      if (/cog/i.test(key)) s += 1;
      return s;
    }
    keys.forEach((k) => {
      const m = re.exec(k);
      if (!m) return;
      const date = m[1];
      const prev = keyByDate.get(date);
      if (!prev) {
        keyByDate.set(date, k);
        return;
      }
      if (scoreKey(k) > scoreKey(prev)) {
        keyByDate.set(date, k);
      } else if (scoreKey(k) === scoreKey(prev) && k.length > prev.length) {
        keyByDate.set(date, k);
      }
    });

    const layers = [];
    function labelDdMmYyyy(d) {
      return d.slice(6, 8) + '/' + d.slice(4, 6) + '/' + d.slice(0, 4);
    }
    keyByDate.forEach((key, date) => {
      layers.push({
        date,
        id: 'cdom-cog-' + date,
        name: 'CDOM ' + labelDdMmYyyy(date),
        key,
        source: 'cog',
      });
    });

    layers.sort((a, b) => (a.date < b.date ? 1 : -1));

    return res.json({ ok: true, bucket, layers });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || String(err) });
  }
});

app.get('/', (req, res) => {
  if (ORBTY_AUTH_DISABLED) return res.redirect('/index.html');
  if (req.session && req.session.user && req.session.user.email) {
    return res.redirect('/index.html');
  }
  return res.redirect('/login.html');
});
app.get('/login', (req, res) => res.redirect('/login.html'));
app.get('/login.html', (req, res) => {
  if (ORBTY_AUTH_DISABLED) return res.redirect('/index.html');
  if (req.session && req.session.user && req.session.user.email) {
    return res.redirect('/index.html');
  }
  return res.sendFile(path.join(ROOT, 'login.html'));
});

// Rotas protegidas (HTML)
app.get('/index.html', requireAuth, (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/info.html', requireAuth, (req, res) => res.sendFile(path.join(ROOT, 'info.html')));
app.get('/admin.html', requireAdmin, (req, res) => res.sendFile(path.join(ROOT, 'admin.html')));

// Arquivos estáticos (assets, js, css, etc.)
app.use(express.static(ROOT, { index: false }));

function start(port) {
  const server = app.listen(port, () => {
    const url = 'http://localhost:' + port;
    console.log('');
    console.log('  Orbty – um único endereço, tudo integrado');
    console.log('  Abra no navegador:  ' + url);
    console.log(ORBTY_AUTH_DISABLED ? '  (Login desativado: entra direto no app)' : '  (Login → Usuário = mapa  |  Admin = painel)');
    console.log('  CDOM COG (GCS):    ' + CDOM_GCS_PREFIX);
    console.log('  CDOM segmentos CSV: ' + CDOM_SEGMENTS_CSV_KEY);
    console.log('');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < 5510) {
      start(port + 1);
    } else {
      throw err;
    }
  });
}
start(PORT);
