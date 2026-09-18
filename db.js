const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'suldery_nails';

let pool;

async function ensureDatabase() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME.replace(/`/g, '``')}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }
}

function createPool() {
  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
  });
  return pool;
}

async function testConnection() {
  if (!pool) throw new Error('Pool de MySQL no inicializado.');
  const connection = await pool.getConnection();
  try { await connection.ping(); }
  finally { connection.release(); }
}

async function initializeSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(statement => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.query(statement);
  }
}

function ensureUploadDirectory() {
  fs.mkdirSync(path.join(__dirname, 'uploads', 'portfolio'), { recursive: true });
}

async function ensureCompatibilityMigrations() {
  const migrations = [
    { table: 'users', column: 'phone', sql: "ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL AFTER email" },
    { table: 'appointments', column: 'client_phone', sql: "ALTER TABLE appointments ADD COLUMN client_phone VARCHAR(30) NULL AFTER client_name" }
  ];
  for (const migration of migrations) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`,
      [DB_NAME, migration.table, migration.column]
    );
    if (Number(rows[0]?.total) === 0) await pool.query(migration.sql);
  }
  await pool.query(
    `UPDATE appointments a
     INNER JOIN users u ON u.id=a.user_id
     SET a.client_phone=u.phone
     WHERE (a.client_phone IS NULL OR a.client_phone='') AND u.phone IS NOT NULL AND u.phone<>''`
  );
}

async function initDatabase() {
  await ensureDatabase();
  createPool();
  await initializeSchema();
  await ensureCompatibilityMigrations();
  await testConnection();
}

module.exports = {
  pool: {
    query(...args) {
      if (!pool) throw new Error('MySQL no está inicializado.');
      return pool.query(...args);
    },
    getConnection(...args) {
      if (!pool) throw new Error('MySQL no está inicializado.');
      return pool.getConnection(...args);
    }
  },
  initDatabase,
  testConnection,
  initializeSchema,
  ensureUploadDirectory
};
