require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const db = require('./src/db');
const { issueToken, clearToken, requireAuth, requireAdmin } = require('./src/auth');
const { QUESTIONS } = require('./src/questions');
const { parseDocument } = require('./src/parser');
const { runAnalysis } = require('./src/analysis');
const { aiNarrative } = require('./src/ai');

const app = express();
app.set('trust proxy', 1); // Render está detrás de un proxy

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
});
const analysisLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30 });

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ---------- Autenticación ----------
app.post(
  '/api/login',
  loginLimiter,
  wrap(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    const { rows } = await db.query('SELECT * FROM users WHERE username=$1', [String(username).trim()]);
    const user = rows[0];
    const ok = user && user.active && (await bcrypt.compare(String(password), user.password_hash));
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });
    issueToken(res, user);
    res.json({ id: user.id, username: user.username, role: user.role, company_name: user.company_name });
  })
);

app.post('/api/logout', (req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => res.json(req.user));

app.post(
  '/api/password',
  requireAuth,
  wrap(async (req, res) => {
    const { current, next } = req.body || {};
    if (!next || String(next).length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!(await bcrypt.compare(String(current || ''), rows[0].password_hash)))
      return res.status(400).json({ error: 'La contraseña actual es incorrecta' });
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(String(next), 12), req.user.id]);
    res.json({ ok: true });
  })
);

// ---------- Administrador: gestión de usuarios ----------
app.get(
  '/api/admin/users',
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const { rows } = await db.query(
      'SELECT id, username, role, company_name, active, created_at FROM users ORDER BY id'
    );
    res.json(rows);
  })
);

app.post(
  '/api/admin/users',
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const { username, password, company_name, role } = req.body || {};
    const u = String(username || '').trim();
    if (!/^[a-zA-Z0-9._@-]{3,50}$/.test(u))
      return res.status(400).json({ error: 'Usuario inválido (3-50 caracteres: letras, números . _ @ -)' });
    if (!password || String(password).length < 8)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    const r = role === 'admin' ? 'admin' : 'user';
    try {
      const { rows } = await db.query(
        `INSERT INTO users (username, password_hash, role, company_name)
         VALUES ($1,$2,$3,$4) RETURNING id, username, role, company_name, active, created_at`,
        [u, await bcrypt.hash(String(password), 12), r, company_name ? String(company_name).slice(0, 120) : null]
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Ese usuario ya existe' });
      throw e;
    }
  })
);

app.patch(
  '/api/admin/users/:id',
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const { password, active, company_name } = req.body || {};
    if (id === req.user.id && active === false)
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
    if (password !== undefined) {
      if (String(password).length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(String(password), 12), id]);
    }
    if (typeof active === 'boolean') await db.query('UPDATE users SET active=$1 WHERE id=$2', [active, id]);
    if (company_name !== undefined)
      await db.query('UPDATE users SET company_name=$1 WHERE id=$2', [String(company_name).slice(0, 120), id]);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/admin/users/:id',
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    await db.query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ ok: true });
  })
);

// ---------- Cuestionario ----------
app.get('/api/questions', requireAuth, (req, res) => res.json(QUESTIONS));

app.get(
  '/api/questionnaire',
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await db.query(
      'SELECT answers, created_at FROM questionnaires WHERE user_id=$1 ORDER BY id DESC LIMIT 1',
      [req.user.id]
    );
    res.json(rows[0] || null);
  })
);

app.post(
  '/api/questionnaire',
  requireAuth,
  wrap(async (req, res) => {
    const answers = {};
    const input = req.body?.answers || {};
    for (const group of QUESTIONS) {
      for (const q of group.fields) {
        const v = input[q.id];
        if (v === undefined || v === null || v === '') continue;
        answers[q.id] = q.type === 'number' ? Number(v) : String(v).slice(0, 2000);
        if (q.type === 'number' && !Number.isFinite(answers[q.id])) delete answers[q.id];
      }
    }
    await db.query('INSERT INTO questionnaires (user_id, answers) VALUES ($1,$2)', [req.user.id, answers]);
    res.json({ ok: true });
  })
);

// ---------- Documentos financieros ----------
const DOC_TYPES = ['estado_resultados', 'balance_general', 'otro'];

app.get(
  '/api/documents',
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await db.query(
      'SELECT id, filename, doc_type, period, extracted, created_at FROM documents WHERE user_id=$1 ORDER BY id DESC',
      [req.user.id]
    );
    res.json(rows);
  })
);

app.post(
  '/api/documents',
  requireAuth,
  upload.single('file'),
  wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Selecciona un archivo' });
    const docType = DOC_TYPES.includes(req.body.doc_type) ? req.body.doc_type : 'otro';
    let parsed;
    try {
      parsed = await parseDocument(req.file);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'No se pudo leer el archivo' });
    }
    const { rows } = await db.query(
      `INSERT INTO documents (user_id, filename, doc_type, period, extracted, raw_text)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, filename, doc_type, period, extracted, created_at`,
      [
        req.user.id,
        req.file.originalname.slice(0, 200),
        docType,
        req.body.period ? String(req.body.period).slice(0, 50) : null,
        parsed.metrics,
        parsed.text.slice(0, 20000),
      ]
    );
    res.status(201).json(rows[0]);
  })
);

app.delete(
  '/api/documents/:id',
  requireAuth,
  wrap(async (req, res) => {
    await db.query('DELETE FROM documents WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id]);
    res.json({ ok: true });
  })
);

// ---------- Análisis ----------
app.post(
  '/api/analysis',
  requireAuth,
  analysisLimiter,
  wrap(async (req, res) => {
    const q = await db.query(
      'SELECT answers FROM questionnaires WHERE user_id=$1 ORDER BY id DESC LIMIT 1',
      [req.user.id]
    );
    const answers = q.rows[0]?.answers;
    if (!answers) return res.status(400).json({ error: 'Primero completa y guarda el cuestionario' });
    const docs = await db.query(
      'SELECT doc_type, period, extracted FROM documents WHERE user_id=$1 ORDER BY id DESC',
      [req.user.id]
    );
    const result = runAnalysis(answers, docs.rows);
    const aiText = await aiNarrative({ company: req.user.company_name, answers, result });
    const saved = await db.query(
      'INSERT INTO analyses (user_id, result, ai_text) VALUES ($1,$2,$3) RETURNING id, created_at',
      [req.user.id, result, aiText]
    );
    res.json({ id: saved.rows[0].id, created_at: saved.rows[0].created_at, result, ai_text: aiText });
  })
);

app.get(
  '/api/analysis/latest',
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await db.query(
      'SELECT id, result, ai_text, created_at FROM analyses WHERE user_id=$1 ORDER BY id DESC LIMIT 1',
      [req.user.id]
    );
    res.json(rows[0] || null);
  })
);

app.get(
  '/api/analysis',
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, created_at, (result->>'score')::int AS score, result->>'nivel' AS nivel
       FROM analyses WHERE user_id=$1 ORDER BY id DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(rows);
  })
);

// ---------- Páginas y estáticos ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect('/login.html'));

app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: 'Archivo demasiado grande (máx. 10 MB)' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
db.init()
  .then(() => app.listen(PORT, () => console.log(`FinPredict escuchando en el puerto ${PORT}`)))
  .catch((e) => {
    console.error('Error al iniciar:', e);
    process.exit(1);
  });
