// Minimal Express + SQLite backend with JWT auth and dueDate + priority
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
require('dotenv').config();

const DB_FILE = process.env.DB_FILE || './orders.db';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const port = process.env.PORT || 4000;

const db = new Database(DB_FILE);
const app = express();
app.use(cors());
app.use(express.json());

// Initialize tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'operator',
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT,
  customer TEXT,
  created_at TEXT,
  current_stage TEXT,
  notes TEXT,
  due_date TEXT,
  priority TEXT,
  created_by INTEGER
);
CREATE TABLE IF NOT EXISTS stages (
  name TEXT PRIMARY KEY,
  seq INTEGER
);
CREATE TABLE IF NOT EXISTS stage_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  stage_name TEXT,
  status TEXT,
  operator TEXT,
  started_at TEXT,
  completed_at TEXT,
  notes TEXT
);
`);

// Seed stages
const stages = [
  { name: 'OrderMaster', seq: 1 },
  { name: 'Fabric', seq: 2 },
  { name: 'Cutting', seq: 3 },
  { name: 'Sewing', seq: 4 },
  { name: 'Packing/Ironing', seq: 5 }
];
const insertStage = db.prepare('INSERT OR IGNORE INTO stages(name, seq) VALUES (?, ?)');
stages.forEach(s => insertStage.run(s.name, s.seq));

// Auth helpers
function signToken(user){
  return jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing Authorization' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid Authorization format' });
  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    req.user = payload; next();
  } catch(e){
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Public auth endpoints
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password, 8);
  try {
    const info = db.prepare('INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(name||null, email, hash, now);
    const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
    const token = signToken(user);
    res.json({ user, token });
  } catch(e){
    if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Email already exists' });
    console.error(e); res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const user = db.prepare('SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = ?').get(email);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(400).json({ error: 'Invalid credentials' });
  const publicUser = { id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at };
  const token = signToken(publicUser);
  res.json({ user: publicUser, token });
});

// Protected APIs
app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

app.get('/api/stages', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT name, seq FROM stages ORDER BY seq').all();
  res.json(rows);
});

app.get('/api/orders', authMiddleware, (req, res) => {
  const stage = req.query.stage;
  let rows;
  if (stage) rows = db.prepare('SELECT * FROM orders WHERE current_stage = ? ORDER BY created_at DESC').all(stage);
  else rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/orders', authMiddleware, (req, res) => {
  const { order_number, customer, notes, due_date, priority } = req.body;
  const created_at = new Date().toISOString();
  const current_stage = 'OrderMaster';
  const info = db.prepare('INSERT INTO orders(order_number, customer, created_at, current_stage, notes, due_date, priority, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(order_number, customer, created_at, current_stage, notes || '', due_date || null, priority || 'normal', req.user.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
  db.prepare('INSERT INTO stage_updates(order_id, stage_name, status, operator, started_at, completed_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(order.id, 'OrderMaster', 'completed', req.user.name || req.user.email, created_at, created_at, 'Created');
  res.json(order);
});

app.get('/api/orders/:id', authMiddleware, (req, res) => {
  const id = req.params.id;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  const updates = db.prepare('SELECT * FROM stage_updates WHERE order_id = ? ORDER BY id').all(id);
  res.json({ order, updates });
});

app.post('/api/orders/:id/update', authMiddleware, (req, res) => {
  const id = req.params.id;
  const { stage_name, status, operator, notes } = req.body;
  const now = new Date().toISOString();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  db.prepare('INSERT INTO stage_updates(order_id, stage_name, status, operator, started_at, completed_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, stage_name, status, operator || req.user.name || req.user.email, now, status === 'completed' ? now : null, notes || null);
  if (status === 'completed') {
    db.prepare('UPDATE orders SET current_stage = ? WHERE id = ?').run(stage_name, id);
  } else {
    db.prepare('UPDATE orders SET current_stage = ? WHERE id = ?').run(stage_name, id);
  }
  const updates = db.prepare('SELECT * FROM stage_updates WHERE order_id = ? ORDER BY id').all(id);
  res.json({ order: db.prepare('SELECT * FROM orders WHERE id = ?').get(id), updates });
});

app.get('/api/stats', authMiddleware, (req, res) => {
  const counts = db.prepare('SELECT current_stage, COUNT(*) as cnt FROM orders GROUP BY current_stage').all();
  const recent = db.prepare('SELECT su.*, o.order_number, o.customer FROM stage_updates su JOIN orders o ON o.id = su.order_id ORDER BY su.id DESC LIMIT 10').all();
  res.json({ counts, recent });
});

app.listen(port, () => console.log('Server running on', port));
