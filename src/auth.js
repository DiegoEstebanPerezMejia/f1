const jwt = require('jsonwebtoken');
const db = require('./db');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  console.error('Define JWT_SECRET (mínimo 16 caracteres).');
  process.exit(1);
}

const COOKIE = 'fp_token';
const isProd = process.env.NODE_ENV === 'production';

function issueToken(res, user) {
  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '8h' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,
    maxAge: 8 * 60 * 60 * 1000,
  });
}

function clearToken(res) {
  res.clearCookie(COOKIE);
}

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE];
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    const payload = jwt.verify(token, SECRET);
    const { rows } = await db.query(
      'SELECT id, username, role, company_name, active FROM users WHERE id=$1',
      [payload.id]
    );
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'Sesión inválida' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

module.exports = { issueToken, clearToken, requireAuth, requireAdmin };
