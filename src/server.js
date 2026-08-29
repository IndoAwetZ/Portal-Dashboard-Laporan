require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// 1. PROXY UNTUK BYPASS BLOKIR IFRAME
// ==========================================
app.use('/proxy-mpdn', createProxyMiddleware({
  target: 'https://mpdn.kemkes.go.id',
  changeOrigin: true,
  pathRewrite: { '^/proxy-mpdn': '' },
  onProxyRes: function (proxyRes, req, res) {
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
    if (proxyRes.headers['set-cookie']) {
      proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].map(cookie => 
        cookie.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=None/gi, '')
      );
    }
  }
}));

// (Opsional) Proxy untuk SITB jika ingin di-embed juga
app.use('/proxy-sitb', createProxyMiddleware({
  target: 'https://sitb.kemkes.go.id',
  changeOrigin: true,
  pathRewrite: { '^/proxy-sitb': '' },
  onProxyRes: function (proxyRes) {
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
  }
}));

// ==========================================
// 2. SERVE FRONTEND & DATABASE SQLITE
// ==========================================
app.use(express.static(path.join(__dirname, '../public')));

const db = new sqlite3.Database('./data.db', (err) => {
  if (err) console.error('Gagal membuka database:', err.message);
  else console.log('Database SQLite terhubung.');
});

// Setup Tabel dan Data Dummy
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY, name TEXT, category TEXT, description TEXT, 
    pic TEXT, deadline_day INTEGER, status TEXT DEFAULT 'BELUM', 
    portal_url TEXT, proxy_url TEXT, last_checked TEXT
  )`);

  const initialReports = [
    {
      id: 'mpdn', name: 'MPDN Kemenkes', category: 'Kematian Maternal & Perinatal',
      description: 'Pelaporan notifikasi dan audit kematian ibu dan bayi.',
      pic: 'PONEK / Kebidanan', deadline_day: 25, status: 'BELUM',
      portal_url: 'https://mpdn.kemkes.go.id/masuk', proxy_url: '/proxy-mpdn/masuk'
    },
    {
      id: 'sitb', name: 'SITB Online', category: 'Tuberkulosis',
      description: 'Sistem Informasi Tuberkulosis faskes dan hasil lab.',
      pic: 'Tim TB DOTS', deadline_day: 10, status: 'SUDAH',
      portal_url: 'https://sitb.kemkes.go.id', proxy_url: '/proxy-sitb'
    }
  ];

  initialReports.forEach(r => {
    db.run(
      `INSERT OR IGNORE INTO reports (id, name, category, description, pic, deadline_day, status, portal_url, proxy_url, last_checked) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
      [r.id, r.name, r.category, r.description, r.pic, r.deadline_day, r.status, r.portal_url, r.proxy_url]
    );
  });
});

// ==========================================
// 3. API ROUTES UNTUK DASHBOARD
// ==========================================
app.get('/api/reports', (req, res) => {
  db.all('SELECT * FROM reports', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/reports/:id/toggle', (req, res) => {
  const { id } = req.params;
  db.get('SELECT status FROM reports WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Data tidak ditemukan' });
    const newStatus = row.status === 'SUDAH' ? 'BELUM' : 'SUDAH';
    db.run(
      "UPDATE reports SET status = ?, last_checked = datetime('now', 'localtime') WHERE id = ?",
      [newStatus, id],
      () => res.json({ success: true, status: newStatus })
    );
  });
});

app.listen(PORT, () => {
  console.log(`Server dashboard berjalan di http://localhost:${PORT}`);
});