const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.error('Falta la variable DATABASE_URL (cadena de conexión de Neon).');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

const query = (text, params) => pool.query(text, params);

async function init() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
      company_name TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS questionnaires (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      answers JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      period TEXT,
      extracted JSONB NOT NULL DEFAULT '{}',
      raw_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      result JSONB NOT NULL,
      ai_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Crea el administrador inicial si no existe ninguno
  const { rows } = await query(`SELECT 1 FROM users WHERE role='admin' LIMIT 1`);
  if (rows.length === 0) {
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASSWORD;
    if (!password || password.length < 8) {
      console.error('Define ADMIN_PASSWORD (mínimo 8 caracteres) para crear el administrador inicial.');
      process.exit(1);
    }
    const hash = await bcrypt.hash(password, 12);
    await query(
      `INSERT INTO users (username, password_hash, role, company_name) VALUES ($1,$2,'admin','Administración')`,
      [username, hash]
    );
    console.log(`Administrador inicial creado: ${username}`);
  }
}

module.exports = { query, init, pool };
